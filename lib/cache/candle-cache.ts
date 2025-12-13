// Cache for candle data to prevent excessive API calls
// Expires based on timeframe (5m cache = 5 min, 4h cache = 4 hours)

import type { Candle, Timeframe } from "../types/trading"

interface CacheEntry {
  data: Candle[]
  timestamp: number
  expiresAt: number
}

class CandleCache {
  private static instance: CandleCache
  private cache: Map<string, CacheEntry> = new Map()

  private constructor() {}

  static getInstance(): CandleCache {
    if (!CandleCache.instance) {
      CandleCache.instance = new CandleCache()
    }
    return CandleCache.instance
  }

  private getCacheKey(timeframe: Timeframe, outputSize: number): string {
    return `${timeframe}-${outputSize}`
  }

  private getExpirationTime(timeframe: Timeframe): number {
    // Cache duration matches timeframe duration
    const durations: Record<Timeframe, number> = {
      "5m": 5 * 60 * 1000, // 5 minutes
      "15m": 15 * 60 * 1000, // 15 minutes
      "1h": 60 * 60 * 1000, // 1 hour
      "4h": 4 * 60 * 60 * 1000, // 4 hours
    }
    return durations[timeframe]
  }

  get(timeframe: Timeframe, outputSize: number): Candle[] | null {
    const key = this.getCacheKey(timeframe, outputSize)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now >= entry.expiresAt) {
      console.log(`[v0] 🗑️ Cache expired for ${timeframe}`)
      this.cache.delete(key)
      return null
    }

    const age = Math.round((now - entry.timestamp) / 1000)
    console.log(`[v0] ✅ Cache hit for ${timeframe} (age: ${age}s)`)
    return entry.data
  }

  set(timeframe: Timeframe, outputSize: number, data: Candle[]): void {
    const key = this.getCacheKey(timeframe, outputSize)
    const now = Date.now()
    const expiresAt = now + this.getExpirationTime(timeframe)

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    })

    console.log(`[v0] 💾 Cached ${data.length} candles for ${timeframe}`)
  }

  clear(): void {
    this.cache.clear()
    console.log("[v0] 🧹 Cleared all candle cache")
  }

  clearTimeframe(timeframe: Timeframe): void {
    const keys = Array.from(this.cache.keys()).filter((key) => key.startsWith(timeframe))
    for (const key of keys) {
      this.cache.delete(key)
    }
    console.log(`[v0] 🧹 Cleared cache for ${timeframe}`)
  }
}

export const candleCache = CandleCache.getInstance()
