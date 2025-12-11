// Backtest analyzer to test strategies on historical data

import type { Candle, Timeframe, Direction } from "../types/trading"
import { TradingEngine } from "./engine"
import { calculateChandelierExit } from "./indicators"
import { detectBreakoutZones, checkBreakout, detectTrendlines, checkTrendlineBreakout } from "./breakout-detector"

interface BacktestResult {
  totalSignals: number
  wins: number
  losses: number
  winRate: number
  totalRMultiples: number
  avgRMultiple: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  signals: BacktestSignal[]
}

interface BacktestSignal {
  timestamp: number
  direction: Direction
  entry: number
  stop: number
  tp1: number
  tp2: number
  exitPrice: number
  rMultiple: number
  outcome: "win" | "loss"
  exitReason: string
}

export class BacktestAnalyzer {
  private engine = new TradingEngine()

  async runBacktest(
    marketData: Record<Timeframe, Candle[]>,
    mode: "conservative" | "aggressive",
  ): Promise<BacktestResult> {
    console.log(`[v0] Starting backtest for ${mode} mode...`)

    const signals: BacktestSignal[] = []
    const candles1h = marketData["1h"]

    // Start from candle 100 to have enough history for indicators
    for (let i = 100; i < candles1h.length - 10; i++) {
      // Create a slice of data up to this point
      const historicalData: Record<Timeframe, Candle[]> = {
        "4h": marketData["4h"].slice(0, Math.floor(i / 4) + 100),
        "1h": marketData["1h"].slice(0, i + 1),
        "15m": marketData["15m"].slice(0, i * 4 + 1),
        "5m": marketData["5m"].slice(0, i * 12 + 1),
      }

      const currentPrice = candles1h[i].close

      // Check if signal would be generated at this point
      const signal = await this.checkSignalConditions(historicalData, currentPrice, mode)

      if (signal) {
        // Simulate the trade outcome by looking at the next 20 candles
        const futureCandles = candles1h.slice(i + 1, i + 21)
        const tradeOutcome = this.simulateTrade(signal, futureCandles)

        signals.push(tradeOutcome)

        // Skip ahead to avoid overlapping signals
        i += 10
      }
    }

    return this.calculateResults(signals, mode)
  }

  private async checkSignalConditions(
    marketData: Record<Timeframe, Candle[]>,
    currentPrice: number,
    mode: "conservative" | "aggressive",
  ): Promise<{ direction: Direction; entry: number; stop: number; tp1: number; tp2: number } | null> {
    const trend4h = this.engine.detectTrend(marketData["4h"], "conservative")
    const trend1h_conservative = this.engine.detectTrend(marketData["1h"], "conservative")
    const trend1h_aggressive = this.engine.detectTrend(marketData["1h"], "aggressive")
    const trend15m = this.engine.detectTrend(marketData["15m"], mode)
    const trend5m = this.engine.detectTrend(marketData["5m"], mode)

    let aligned = false
    let direction: Direction = "ranging"

    if (mode === "conservative") {
      aligned = trend4h === trend1h_conservative && trend4h !== "ranging"
      direction = aligned ? trend4h : "ranging"
    } else {
      aligned = trend1h_aggressive === trend15m && trend1h_aggressive === trend5m && trend1h_aggressive !== "ranging"
      direction = aligned ? trend1h_aggressive : "ranging"
    }

    if (!aligned || direction === "ranging") {
      return null
    }

    // Check for breakout
    const zones = detectBreakoutZones(marketData["1h"])
    const trendlines = detectTrendlines(marketData["1h"], 50)

    const breakout = checkBreakout(currentPrice, marketData["1h"], zones)
    const trendlineBreakout = checkTrendlineBreakout(currentPrice, marketData["1h"], trendlines)

    const validBreakout = breakout.isBreakout ? breakout : trendlineBreakout.isBreakout ? trendlineBreakout : null

    if (!validBreakout || validBreakout.direction !== direction) {
      return null
    }

    // Calculate stops and targets
    const chandelier = calculateChandelierExit(marketData["1h"], 22, 3)
    const chandelierStop =
      direction === "bullish"
        ? chandelier.stopLong[chandelier.stopLong.length - 1]
        : chandelier.stopShort[chandelier.stopShort.length - 1]

    const riskAmount = Math.abs(currentPrice - chandelierStop)
    const tp1 = direction === "bullish" ? currentPrice + riskAmount * 2 : currentPrice - riskAmount * 2
    const tp2 = direction === "bullish" ? currentPrice + riskAmount * 3 : currentPrice - riskAmount * 3

    return {
      direction,
      entry: currentPrice,
      stop: chandelierStop,
      tp1,
      tp2,
    }
  }

  private simulateTrade(
    signal: { direction: Direction; entry: number; stop: number; tp1: number; tp2: number },
    futureCandles: Candle[],
  ): BacktestSignal {
    let exitPrice = signal.entry
    let exitReason = "timeout"
    let outcome: "win" | "loss" = "loss"

    // Check each future candle for stop or target hit
    for (const candle of futureCandles) {
      if (signal.direction === "bullish") {
        // Check stop loss
        if (candle.low <= signal.stop) {
          exitPrice = signal.stop
          exitReason = "stop_loss"
          outcome = "loss"
          break
        }
        // Check TP1
        if (candle.high >= signal.tp1) {
          exitPrice = signal.tp1
          exitReason = "tp1_hit"
          outcome = "win"
          break
        }
      } else {
        // Check stop loss
        if (candle.high >= signal.stop) {
          exitPrice = signal.stop
          exitReason = "stop_loss"
          outcome = "loss"
          break
        }
        // Check TP1
        if (candle.low <= signal.tp1) {
          exitPrice = signal.tp1
          exitReason = "tp1_hit"
          outcome = "win"
          break
        }
      }
    }

    // Calculate R-multiple
    const risk = Math.abs(signal.entry - signal.stop)
    const reward = Math.abs(exitPrice - signal.entry)
    const rMultiple =
      signal.direction === "bullish" ? (exitPrice - signal.entry) / risk : (signal.entry - exitPrice) / risk

    return {
      timestamp: Date.now(),
      direction: signal.direction,
      entry: signal.entry,
      stop: signal.stop,
      tp1: signal.tp1,
      tp2: signal.tp2,
      exitPrice,
      rMultiple,
      outcome,
      exitReason,
    }
  }

  private calculateResults(signals: BacktestSignal[], mode: string): BacktestResult {
    if (signals.length === 0) {
      return {
        totalSignals: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalRMultiples: 0,
        avgRMultiple: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        signals: [],
      }
    }

    const wins = signals.filter((s) => s.outcome === "win").length
    const losses = signals.filter((s) => s.outcome === "loss").length
    const totalRMultiples = signals.reduce((sum, s) => sum + s.rMultiple, 0)
    const avgRMultiple = totalRMultiples / signals.length

    const winningR = signals.filter((s) => s.outcome === "win").reduce((sum, s) => sum + s.rMultiple, 0)
    const losingR = Math.abs(signals.filter((s) => s.outcome === "loss").reduce((sum, s) => sum + s.rMultiple, 0))
    const profitFactor = losingR > 0 ? winningR / losingR : winningR

    const bestTrade = Math.max(...signals.map((s) => s.rMultiple))
    const worstTrade = Math.min(...signals.map((s) => s.rMultiple))

    console.log(`[v0] ${mode} mode backtest results:`)
    console.log(`[v0] Total signals: ${signals.length}`)
    console.log(`[v0] Wins: ${wins} (${((wins / signals.length) * 100).toFixed(1)}%)`)
    console.log(`[v0] Losses: ${losses} (${((losses / signals.length) * 100).toFixed(1)}%)`)
    console.log(`[v0] Avg R-multiple: ${avgRMultiple.toFixed(2)}R`)
    console.log(`[v0] Profit factor: ${profitFactor.toFixed(2)}`)

    return {
      totalSignals: signals.length,
      wins,
      losses,
      winRate: (wins / signals.length) * 100,
      totalRMultiples,
      avgRMultiple,
      bestTrade,
      worstTrade,
      profitFactor,
      signals,
    }
  }
}

export const backtestAnalyzer = new BacktestAnalyzer()
