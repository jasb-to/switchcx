import type { TradingSignal } from "@/lib/types/trading"

interface StoredSignal {
  signal: TradingSignal
  createdAt: number
  lastValidated: number
}

class SignalStore {
  private activeSignal: StoredSignal | null = null
  private readonly SIGNAL_TTL = 4 * 60 * 60 * 1000 // 4 hours - signals stay active until invalidated

  setActiveSignal(signal: TradingSignal): void {
    this.activeSignal = {
      signal,
      createdAt: Date.now(),
      lastValidated: Date.now(),
    }
    console.log("[v0] SignalStore: Active signal set -", signal.direction, "Entry:", signal.entryPrice)
  }

  getActiveSignal(): TradingSignal | null {
    if (!this.activeSignal) return null

    // Check if signal has expired (4 hours)
    const age = Date.now() - this.activeSignal.createdAt
    if (age > this.SIGNAL_TTL) {
      console.log("[v0] SignalStore: Signal expired (age:", Math.floor(age / 60000), "minutes)")
      this.activeSignal = null
      return null
    }

    // Update last validated timestamp
    this.activeSignal.lastValidated = Date.now()
    return this.activeSignal.signal
  }

  invalidateSignal(): void {
    console.log("[v0] SignalStore: Signal invalidated")
    this.activeSignal = null
  }

  hasActiveSignal(): boolean {
    return this.activeSignal !== null
  }

  getSignalAge(): number {
    if (!this.activeSignal) return 0
    return Date.now() - this.activeSignal.createdAt
  }

  getActiveSignalDirection(): "bullish" | "bearish" | null {
    if (!this.activeSignal) return null
    return this.activeSignal.signal.direction
  }
}

export { SignalStore }
export const signalStore = new SignalStore()
