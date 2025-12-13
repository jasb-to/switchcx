// Trade history manager for tracking and analyzing trade performance

interface Trade {
  id: string
  symbol: string
  direction: "bullish" | "bearish"
  entryPrice: number
  entryTime: number
  exitPrice?: number
  exitTime?: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  pnl?: number
  pnlPercent?: number
  rMultiple?: number
  status: "open" | "closed"
  exitReason?: string
  duration?: number
}

class TradeHistoryManager {
  private trades: Trade[] = []
  private maxHistorySize = 100

  addTrade(trade: Omit<Trade, "id">): string {
    const id = `trade_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const newTrade: Trade = { ...trade, id }
    this.trades.push(newTrade)

    // Keep only last maxHistorySize trades
    if (this.trades.length > this.maxHistorySize) {
      this.trades = this.trades.slice(-this.maxHistorySize)
    }

    console.log("[v0] TradeHistoryManager: Trade added -", id)
    return id
  }

  updateTrade(id: string, updates: Partial<Trade>): void {
    const index = this.trades.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.trades[index] = { ...this.trades[index], ...updates }
      console.log("[v0] TradeHistoryManager: Trade updated -", id)
    }
  }

  getTrade(id: string): Trade | undefined {
    return this.trades.find((t) => t.id === id)
  }

  getAllTrades(): Trade[] {
    return [...this.trades]
  }

  getOpenTrades(): Trade[] {
    return this.trades.filter((t) => t.status === "open")
  }

  getClosedTrades(): Trade[] {
    return this.trades.filter((t) => t.status === "closed")
  }

  getWinRate(): number {
    const closedTrades = this.getClosedTrades()
    if (closedTrades.length === 0) return 0

    const winners = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length
    return (winners / closedTrades.length) * 100
  }

  getTotalPnL(): number {
    return this.getClosedTrades().reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  }

  getAverageRMultiple(): number {
    const closedTrades = this.getClosedTrades()
    if (closedTrades.length === 0) return 0

    const totalR = closedTrades.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0)
    return totalR / closedTrades.length
  }

  clear(): void {
    this.trades = []
    console.log("[v0] TradeHistoryManager: History cleared")
  }
}

export const tradeHistoryManager = new TradeHistoryManager()
