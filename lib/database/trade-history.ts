// Trade history persistence using localStorage (can be upgraded to Supabase/Neon later)

import type { TradeHistory, PerformanceMetrics } from "../types/trading"

const STORAGE_KEY = "switchcx_trade_history"
const MAX_STORED_TRADES = 100

export class TradeHistoryManager {
  private static instance: TradeHistoryManager
  private tradeHistory: TradeHistory[] = []

  private constructor() {
    this.loadFromStorage()
  }

  static getInstance(): TradeHistoryManager {
    if (!TradeHistoryManager.instance) {
      TradeHistoryManager.instance = new TradeHistoryManager()
    }
    return TradeHistoryManager.instance
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.tradeHistory = JSON.parse(stored)
      }
    } catch (error) {
      console.error("[v0] Error loading trade history:", error)
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tradeHistory.slice(-MAX_STORED_TRADES)))
    } catch (error) {
      console.error("[v0] Error saving trade history:", error)
    }
  }

  addTrade(trade: TradeHistory): void {
    this.tradeHistory.push(trade)
    this.saveToStorage()
    console.log("[v0] Trade added to history:", trade.id)
  }

  updateTrade(id: string, updates: Partial<TradeHistory>): void {
    const index = this.tradeHistory.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.tradeHistory[index] = { ...this.tradeHistory[index], ...updates }
      this.saveToStorage()
      console.log("[v0] Trade updated:", id)
    }
  }

  getTrade(id: string): TradeHistory | undefined {
    return this.tradeHistory.find((t) => t.id === id)
  }

  getAllTrades(): TradeHistory[] {
    return [...this.tradeHistory]
  }

  getRecentTrades(count = 10): TradeHistory[] {
    return this.tradeHistory.slice(-count).reverse()
  }

  calculatePerformanceMetrics(timeframe?: { start: number; end: number }): PerformanceMetrics {
    let trades = this.tradeHistory.filter((t) => t.exitTime && t.pnl !== undefined)

    if (timeframe) {
      trades = trades.filter((t) => t.entryTime >= timeframe.start && t.entryTime <= timeframe.end)
    }

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        avgRMultiple: 0,
        maxDrawdown: 0,
        totalPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgHoldTime: 0,
        sharpeRatio: 0,
      }
    }

    const winners = trades.filter((t) => t.pnl! > 0)
    const losers = trades.filter((t) => t.pnl! < 0)

    const totalWin = winners.reduce((sum, t) => sum + t.pnl!, 0)
    const totalLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl!, 0))

    const avgWin = winners.length > 0 ? totalWin / winners.length : 0
    const avgLoss = losers.length > 0 ? totalLoss / losers.length : 0

    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 999 : 0

    const avgRMultiple = trades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / trades.length

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl!, 0)

    const pnls = trades.map((t) => t.pnl!)
    const bestTrade = Math.max(...pnls)
    const worstTrade = Math.min(...pnls)

    // Calculate max drawdown
    let peak = 0
    let maxDrawdown = 0
    let running = 0

    trades.forEach((t) => {
      running += t.pnl!
      if (running > peak) peak = running
      const drawdown = peak - running
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    })

    const avgHoldTime = trades.reduce((sum, t) => sum + (t.duration || 0), 0) / trades.length

    // Simple Sharpe ratio calculation
    const returns = trades.map((t) => t.pnlPercent || 0)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0

    return {
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: (winners.length / trades.length) * 100,
      avgWin,
      avgLoss,
      profitFactor,
      avgRMultiple,
      maxDrawdown,
      totalPnl,
      bestTrade,
      worstTrade,
      avgHoldTime,
      sharpeRatio,
    }
  }

  getHistoricalSuccessRate(priceLevel: number, direction: "bullish" | "bearish", tolerance = 50): number {
    const relevantTrades = this.tradeHistory.filter(
      (t) => t.exitTime && t.signal.direction === direction && Math.abs(t.entryPrice - priceLevel) <= tolerance,
    )

    if (relevantTrades.length === 0) return 50 // Default to neutral if no history

    const winners = relevantTrades.filter((t) => t.pnl! > 0).length
    return (winners / relevantTrades.length) * 100
  }

  clearHistory(): void {
    this.tradeHistory = []
    this.saveToStorage()
  }
}

export const tradeHistoryManager = TradeHistoryManager.getInstance()
