// Advanced trade management with partial exits and trailing stops

import type { TradingSignal, TradeManagement, Candle } from "../types/trading"

export class TradeManager {
  private management: Map<string, TradeManagement> = new Map()

  initializeTrade(signalId: string, signal: TradingSignal): void {
    this.management.set(signalId, {
      tp1Hit: false,
      tp2Hit: false,
      breakEvenSet: false,
      trailingStopActive: false,
      partialCloseAt: [],
      currentStopLoss: signal.stopLoss,
    })
  }

  updateTrade(
    signalId: string,
    currentPrice: number,
    signal: TradingSignal,
    latestCandle: Candle,
  ): {
    action?: "close_50" | "close_remaining" | "stop_hit" | "move_to_breakeven" | "trail_stop"
    newStopLoss?: number
    message?: string
  } {
    const mgmt = this.management.get(signalId)
    if (!mgmt) return {}

    const isLong = signal.direction === "bullish"
    const riskAmount = Math.abs(signal.entryPrice - signal.stopLoss)

    // Check TP1 (50% close at 2R)
    if (!mgmt.tp1Hit && signal.tp1) {
      const tp1Hit = isLong ? currentPrice >= signal.tp1 : currentPrice <= signal.tp1
      if (tp1Hit) {
        mgmt.tp1Hit = true
        mgmt.partialCloseAt.push(currentPrice)
        return {
          action: "close_50",
          message: `TP1 hit! Close 50% at $${currentPrice.toFixed(2)}. Move stop to breakeven.`,
        }
      }
    }

    // Check TP2 (remaining 50% at 3R)
    if (mgmt.tp1Hit && !mgmt.tp2Hit && signal.tp2) {
      const tp2Hit = isLong ? currentPrice >= signal.tp2 : currentPrice <= signal.tp2
      if (tp2Hit) {
        mgmt.tp2Hit = true
        mgmt.partialCloseAt.push(currentPrice)
        return {
          action: "close_remaining",
          message: `TP2 hit! Close remaining 50% at $${currentPrice.toFixed(2)}.`,
        }
      }
    }

    // Move to breakeven after +1R
    if (!mgmt.breakEvenSet) {
      const profit = isLong ? currentPrice - signal.entryPrice : signal.entryPrice - currentPrice
      if (profit >= riskAmount) {
        mgmt.breakEvenSet = true
        mgmt.currentStopLoss = signal.entryPrice
        return {
          action: "move_to_breakeven",
          newStopLoss: signal.entryPrice,
          message: `Profit at +1R! Moving stop to breakeven ($${signal.entryPrice.toFixed(2)}).`,
        }
      }
    }

    // Trailing stop using Chandelier Exit
    if (mgmt.breakEvenSet && !mgmt.trailingStopActive) {
      mgmt.trailingStopActive = true
    }

    if (mgmt.trailingStopActive) {
      const newStop = signal.chandelierStop
      const shouldUpdate = isLong ? newStop > mgmt.currentStopLoss : newStop < mgmt.currentStopLoss

      if (shouldUpdate) {
        mgmt.currentStopLoss = newStop
        return {
          action: "trail_stop",
          newStopLoss: newStop,
          message: `Trailing stop updated to $${newStop.toFixed(2)} (Chandelier Exit).`,
        }
      }
    }

    // Check stop loss hit
    const stopHit = isLong ? currentPrice <= mgmt.currentStopLoss : currentPrice >= mgmt.currentStopLoss

    if (stopHit) {
      return {
        action: "stop_hit",
        message: `Stop loss hit at $${currentPrice.toFixed(2)}. Exit trade.`,
      }
    }

    return {}
  }

  getManagement(signalId: string): TradeManagement | undefined {
    return this.management.get(signalId)
  }

  removeTrade(signalId: string): void {
    this.management.delete(signalId)
  }
}

export const tradeManager = new TradeManager()
