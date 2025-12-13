// Persistent rate limit tracking that survives server restarts
// Uses in-memory cache with expiration at midnight UTC

interface RateLimitState {
  exhaustedKeys: Set<number>
  exhaustedAt: number
  resetTime: number
}

class RateLimitCache {
  private static instance: RateLimitCache
  private state: RateLimitState = {
    exhaustedKeys: new Set(),
    exhaustedAt: 0,
    resetTime: 0,
  }

  private constructor() {
    this.calculateResetTime()
  }

  static getInstance(): RateLimitCache {
    if (!RateLimitCache.instance) {
      RateLimitCache.instance = new RateLimitCache()
    }
    return RateLimitCache.instance
  }

  private calculateResetTime(): void {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setUTCHours(24, 0, 0, 0)
    this.state.resetTime = midnight.getTime()
  }

  private checkReset(): void {
    const now = Date.now()
    if (now >= this.state.resetTime) {
      console.log("[v0] 🔄 Rate limit reset at midnight UTC - clearing exhausted keys")
      this.state.exhaustedKeys.clear()
      this.state.exhaustedAt = 0
      this.calculateResetTime()
    }
  }

  isRateLimited(): boolean {
    this.checkReset()
    return this.state.exhaustedKeys.size > 0
  }

  markKeyExhausted(keyIndex: number, totalKeys: number): void {
    this.checkReset()
    this.state.exhaustedKeys.add(keyIndex)
    this.state.exhaustedAt = Date.now()
    console.log(`[v0] ⚠️ Rate limit: ${this.state.exhaustedKeys.size}/${totalKeys} keys exhausted`)
  }

  getExhaustedKeys(): Set<number> {
    this.checkReset()
    return new Set(this.state.exhaustedKeys)
  }

  getResetTime(): number {
    this.checkReset()
    return this.state.resetTime
  }

  clear(): void {
    this.state.exhaustedKeys.clear()
    this.state.exhaustedAt = 0
    console.log("[v0] ✅ Rate limit cache cleared manually")
  }
}

export const rateLimitCache = RateLimitCache.getInstance()
