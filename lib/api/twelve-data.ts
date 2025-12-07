// Twelve Data API client with rate limiting and error handling

import type { Candle, Timeframe } from "../types/trading"

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
}

class TwelveDataClient {
  private readonly baseUrl = "https://api.twelvedata.com"
  private readonly symbol = "XAU/USD"
  private requestQueue: Array<() => Promise<void>> = []
  private isProcessing = false
  private lastRequestTime = 0
  private readonly minRequestInterval = 1000 // 1 second between requests

  private getApiKey(): string {
    const apiKey = process.env.TWELVE_DATA_API_KEY
    if (!apiKey) {
      throw new Error("TWELVE_DATA_API_KEY environment variable is not set")
    }
    return apiKey
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

  async fetchCandles(timeframe: Timeframe, outputSize = 300): Promise<Candle[]> {
    return this.enqueueRequest(async () => {
      const interval = this.mapTimeframeToInterval(timeframe)
      const apiKey = this.getApiKey()

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
          next: { revalidate: 300 }, // Cache for 5 minutes to reduce API calls
        })

        if (!response.ok) {
          throw new Error(`Twelve Data API error: ${response.status} ${response.statusText}`)
        }

        const data: TwelveDataResponse = await response.json()

        if (data.status === "error") {
          throw new Error(`Twelve Data API error: ${JSON.stringify(data)}`)
        }

        if (!data.values || data.values.length === 0) {
          throw new Error("No data returned from Twelve Data API")
        }

        console.log("[v0] Successfully fetched", data.values.length, "candles for", timeframe)

        // Normalize and sort by timestamp (oldest to newest)
        return data.values.map((candle) => this.normalizeCandle(candle)).sort((a, b) => a.timestamp - b.timestamp)
      } catch (error) {
        console.error(`[v0] Error fetching ${timeframe} candles:`, error)
        throw error
      }
    })
  }

  async fetchMultipleTimeframes(timeframes: Timeframe[]): Promise<Record<Timeframe, Candle[]>> {
    const results: Record<string, Candle[]> = {}

    for (const timeframe of timeframes) {
      try {
        console.log("[v0] Fetching", timeframe, "data...")
        results[timeframe] = await this.fetchCandles(timeframe, 300)
        console.log("[v0] Successfully fetched", results[timeframe].length, "candles for", timeframe)

        // Wait 2 seconds between requests to stay under rate limit
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`[v0] Failed to fetch ${timeframe} data:`, error)
        results[timeframe] = []
      }
    }

    return results as Record<Timeframe, Candle[]>
  }

  async getLatestPrice(): Promise<number> {
    return this.enqueueRequest(async () => {
      const apiKey = this.getApiKey()

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
        return Number.parseFloat(data.price)
      } catch (error) {
        console.error("[v0] Error fetching latest price:", error)
        throw error
      }
    })
  }
}

export const twelveDataClient = new TwelveDataClient()
