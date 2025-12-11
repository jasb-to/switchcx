import type { Candle, Timeframe } from "../types/trading"
import { TradingEngine } from "./engine"

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
  direction: string
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
  private engine: TradingEngine

  constructor() {
    this.engine = new TradingEngine()
  }

  async runBacktest(
    marketData: Record<Timeframe, Candle[]>,
    mode: "conservative" | "aggressive",
  ): Promise<BacktestResult> {
    console.log(`[v0] ===== STARTING ${mode.toUpperCase()} BACKTEST =====`)
    console.log(`[v0] Using real TradingEngine.generateSignal() method`)
    console.log(`[v0] 4H candles: ${marketData["4h"].length}`)
    console.log(`[v0] 1H candles: ${marketData["1h"].length}`)
    console.log(`[v0] 15M candles: ${marketData["15m"].length}`)
    console.log(`[v0] 5M candles: ${marketData["5m"].length}`)

    const first1h = marketData["1h"][0]
    const last1h = marketData["1h"][marketData["1h"].length - 1]
    console.log(
      `[v0] 1H data range: ${new Date(first1h.timestamp).toISOString()} to ${new Date(last1h.timestamp).toISOString()}`,
    )

    const signals: BacktestSignal[] = []
    const candles1h = marketData["1h"]

    // Start from candle 150 to have enough history for indicators
    for (let i = 150; i < candles1h.length - 20; i += 5) {
      const currentPrice = candles1h[i].close

      const historicalData: Record<Timeframe, Candle[]> = {
        "4h": marketData["4h"].slice(0, Math.floor(i / 4) + 1),
        "1h": marketData["1h"].slice(0, i + 1),
        "15m": marketData["15m"].slice(0, i * 4 + 1),
        "5m": marketData["5m"].slice(0, i * 12 + 1),
      }

      const allowEarlyEntry = mode === "aggressive"
      const signal = await this.engine.generateSignal(historicalData, currentPrice, allowEarlyEntry)

      if (signal && signal.metadata?.signalMode === mode) {
        console.log(
          `[v0] ✅ ${mode} signal at candle ${i}, time: ${new Date(candles1h[i].timestamp).toISOString()}, ${signal.direction} @ $${currentPrice.toFixed(2)}`,
        )

        const futureCandles = candles1h.slice(i + 1, i + 41) // Check next 40 candles (40 hours)
        const tradeOutcome = this.simulateTrade(signal, futureCandles)

        signals.push(tradeOutcome)

        // Skip ahead to avoid overlapping signals
        i += 20
      }
    }

    console.log(`[v0] Backtest complete. Found ${signals.length} ${mode} signals.`)
    return this.calculateResults(signals, mode)
  }

  private simulateTrade(signal: any, futureCandles: Candle[]): BacktestSignal {
    let exitPrice = signal.entryPrice
    let exitReason = "timeout"
    let outcome: "win" | "loss" = "loss"

    for (const candle of futureCandles) {
      if (signal.direction === "bullish") {
        // Check stop loss first
        if (candle.low <= signal.stopLoss) {
          exitPrice = signal.stopLoss
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
        // Check stop loss first
        if (candle.high >= signal.stopLoss) {
          exitPrice = signal.stopLoss
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
    const risk = Math.abs(signal.entryPrice - signal.stopLoss)
    const reward = Math.abs(exitPrice - signal.entryPrice)
    const rMultiple =
      signal.direction === "bullish" ? (exitPrice - signal.entryPrice) / risk : (signal.entryPrice - exitPrice) / risk

    return {
      timestamp: signal.timestamp,
      direction: signal.direction,
      entry: signal.entryPrice,
      stop: signal.stopLoss,
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
      console.log(`[v0] No ${mode} signals found in historical data`)
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

    console.log(`[v0] ===== ${mode.toUpperCase()} MODE RESULTS =====`)
    console.log(`[v0] Total signals: ${signals.length}`)
    console.log(`[v0] Wins: ${wins} (${((wins / signals.length) * 100).toFixed(1)}%)`)
    console.log(`[v0] Losses: ${losses} (${((losses / signals.length) * 100).toFixed(1)}%)`)
    console.log(`[v0] Avg R-multiple: ${avgRMultiple.toFixed(2)}R`)
    console.log(`[v0] Profit factor: ${profitFactor.toFixed(2)}`)
    console.log(`[v0] Best trade: ${bestTrade.toFixed(2)}R`)
    console.log(`[v0] Worst trade: ${worstTrade.toFixed(2)}R`)

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
