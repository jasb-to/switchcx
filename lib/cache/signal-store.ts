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
  }

  getActiveSignal(): TradingSignal | null {
    if (!this.activeSignal) return null

    // Check if signal has expired (4 hours)
    const age = Date.now() - this.activeSignal.createdAt
    if (age > this.SIGNAL_TTL) {
      this.activeSignal = null
      return null
    }

    // Update last validated timestamp
    this.activeSignal.lastValidated = Date.now()
    return this.activeSignal.signal
  }

  invalidateSignal(): void {
    this.activeSignal = null
  }

  hasActiveSignal(): boolean {
    return this.activeSignal !== null
  }

  getSignalAge(): number {
    if (!this.activeSignal) return 0
    return Date.now() - this.activeSignal.createdAt
  }
}

export const signalStore = new SignalStore()
