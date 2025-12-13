// Twelve Data API client with rate limiting, error handling, and caching

import type { Candle, Timeframe } from "../types/trading"
import { rateLimitCache } from "../cache/rate-limit-cache"
import { candleCache } from "../cache/candle-cache"

interface TwelveDataCandle {
  datetime: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

interface TwelveDataResponse {
  meta: {
    symbol: string
    interval: string
    currency: string
    exchange_timezone: string
  }
  values: TwelveDataCandle[]
  status: string
  code?: number
}

class TwelveDataClient {
  private readonly baseUrl = "https://api.twelvedata.com"
  private readonly symbol = "XAU/USD"
  private requestQueue: Array<() => Promise<void>> = []
  private isProcessing = false
  private lastRequestTime = 0
  private readonly minRequestInterval = 2000 // 2 seconds between requests

  private getApiKeys(): string[] {
    const keys = []

    // Primary key
    if (process.env.TWELVE_DATA_API_KEY) {
      keys.push(process.env.TWELVE_DATA_API_KEY)
    }

    // Secondary key
    if (process.env.TWELVE_DATA_API_KEY_2) {
      keys.push(process.env.TWELVE_DATA_API_KEY_2)
    }

    // Additional keys (support up to 5)
    if (process.env.TWELVE_DATA_API_KEY_3) {
      keys.push(process.env.TWELVE_DATA_API_KEY_3)
    }

    if (keys.length === 0) {
      throw new Error("At least one TWELVE_DATA_API_KEY environment variable is required")
    }

    console.log(`[v0] Loaded ${keys.length} Twelve Data API key(s)`)
    return keys
  }

  private async throttle(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime = Date.now()
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()
      if (request) {
        await this.throttle()
        await request()
      }
    }

    this.isProcessing = false
  }

  private async enqueueRequest<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.processQueue()
    })
  }

  private mapTimeframeToInterval(timeframe: Timeframe): string {
    const mapping: Record<Timeframe, string> = {
      "5m": "5min",
      "15m": "15min",
      "1h": "1h",
      "4h": "4h",
    }
    return mapping[timeframe]
  }

  private normalizeCandle(candle: TwelveDataCandle): Candle {
    return {
      timestamp: new Date(candle.datetime).getTime(),
      open: Number.parseFloat(candle.open),
      high: Number.parseFloat(candle.high),
      low: Number.parseFloat(candle.low),
      close: Number.parseFloat(candle.close),
      volume: Number.parseFloat(candle.volume),
    }
  }

  async fetchCandles(timeframe: Timeframe, outputSize = 200): Promise<Candle[]> {
    const cached = candleCache.get(timeframe, outputSize)
    if (cached) {
      return cached
    }

    if (rateLimitCache.isRateLimited()) {
      const resetTime = new Date(rateLimitCache.getResetTime()).toISOString()
      throw new Error(
        `Daily API limit reached. All API keys exhausted. Service resumes at midnight UTC (${resetTime}).`,
      )
    }

    return this.enqueueRequest(async () => {
      const interval = this.mapTimeframeToInterval(timeframe)
      const keys = this.getApiKeys()

      const exhaustedKeys = rateLimitCache.getExhaustedKeys()

      let apiKey: string | null = null
      let keyIndex = -1

      for (let i = 0; i < keys.length; i++) {
        if (!exhaustedKeys.has(i)) {
          apiKey = keys[i]
          keyIndex = i
          break
        }
      }

      if (!apiKey) {
        throw new Error(
          `Daily API limit reached. All ${keys.length} API keys exhausted. Service resumes at midnight UTC.`,
        )
      }

      const url = new URL(`${this.baseUrl}/time_series`)
      url.searchParams.append("symbol", this.symbol)
      url.searchParams.append("interval", interval)
      url.searchParams.append("outputsize", outputSize.toString())
      url.searchParams.append("apikey", apiKey)
      url.searchParams.append("format", "JSON")

      console.log("[v0] Fetching", outputSize, "candles for", timeframe)

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          next: { revalidate: 600 },
        })

        if (!response.ok) {
          throw new Error(`Twelve Data API error: ${response.status} ${response.statusText}`)
        }

        const data: TwelveDataResponse = await response.json()

        if (data.status === "error") {
          const errorData = data as any
          if (errorData.code === 429) {
            console.warn(`[v0] API key ${keyIndex + 1} exhausted. Marking as unavailable.`)
            rateLimitCache.markKeyExhausted(keyIndex, keys.length)

            throw new Error(
              `Daily API limit reached. ${rateLimitCache.getExhaustedKeys().size}/${keys.length} keys exhausted. Service resumes at midnight UTC.`,
            )
          }

          throw new Error(`Twelve Data API error: ${JSON.stringify(data)}`)
        }

        if (!data.values || data.values.length === 0) {
          throw new Error("No data returned from Twelve Data API")
        }

        console.log("[v0] Successfully fetched", data.values.length, "candles for", timeframe)

        const candles = data.values
          .map((candle) => this.normalizeCandle(candle))
          .sort((a, b) => a.timestamp - b.timestamp)
        candleCache.set(timeframe, outputSize, candles)

        return candles
      } catch (error) {
        console.error(`[v0] Error fetching ${timeframe} candles:`, error)
        throw error
      }
    })
  }

  async fetchMultipleTimeframes(timeframes: Timeframe[]): Promise<Record<Timeframe, Candle[]>> {
    if (rateLimitCache.isRateLimited()) {
      throw new Error(`Daily API limit reached. All API keys exhausted. Service resumes at midnight UTC.`)
    }

    const results: Record<string, Candle[]> = {}

    for (const timeframe of timeframes) {
      try {
        console.log("[v0] Fetching", timeframe, "data...")
        results[timeframe] = await this.fetchCandles(timeframe, 200)
        console.log("[v0] Successfully fetched", results[timeframe].length, "candles for", timeframe)

        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes("Daily API limit") || errorMessage.includes("keys exhausted")) {
          console.error(`[v0] ❌ All API keys exhausted. Stopping data fetch.`)
          throw error
        }
        console.error(`Failed to fetch ${timeframe} data:`, error)
        throw error
      }
    }

    return results as Record<Timeframe, Candle[]>
  }

  async getLatestPrice(): Promise<number> {
    if (rateLimitCache.isRateLimited()) {
      throw new Error(`Daily API limit reached. Service resumes at midnight UTC.`)
    }

    return this.enqueueRequest(async () => {
      const keys = this.getApiKeys()
      const exhaustedKeys = rateLimitCache.getExhaustedKeys()

      let apiKey: string | null = null
      let keyIndex = -1

      for (let i = 0; i < keys.length; i++) {
        if (!exhaustedKeys.has(i)) {
          apiKey = keys[i]
          keyIndex = i
          break
        }
      }

      if (!apiKey) {
        throw new Error(`Daily API limit reached. Service resumes at midnight UTC.`)
      }

      const url = new URL(`${this.baseUrl}/price`)
      url.searchParams.append("symbol", this.symbol)
      url.searchParams.append("apikey", apiKey)

      try {
        const response = await fetch(url.toString(), {
          next: { revalidate: 0 },
        })

        if (!response.ok) {
          throw new Error(`Twelve Data API error: ${response.status}`)
        }

        const data = await response.json()

        if (data.status === "error" && data.code === 429) {
          console.warn(`[v0] API key ${keyIndex + 1} exhausted. Marking as unavailable.`)
          rateLimitCache.markKeyExhausted(keyIndex, keys.length)

          throw new Error(`Daily API limit reached. Service resumes at midnight UTC.`)
        }

        return Number.parseFloat(data.price)
      } catch (error) {
        console.error("[v0] Error fetching latest price:", error)
        throw error
      }
    })
  }
}

export const twelveDataClient = new TwelveDataClient()
export const twelveDataAPI = {
  getTimeSeriesData: (symbol: string, timeframe: Timeframe, outputSize: number) =>
    twelveDataClient.fetchCandles(timeframe, outputSize),
  getLatestPrice: () => twelveDataClient.getLatestPrice(),
}
