import type { Candle, Timeframe, Direction } from "../types/trading"
import { calculateEMA, calculateChandelierExit } from "./indicators"
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
  async runBacktest(
    marketData: Record<Timeframe, Candle[]>,
    mode: "conservative" | "aggressive",
  ): Promise<BacktestResult> {
    console.log(`[v0] ===== STARTING ${mode.toUpperCase()} BACKTEST =====`)
    console.log(`[v0] 4H candles: ${marketData["4h"].length}`)
    console.log(`[v0] 1H candles: ${marketData["1h"].length}`)
    console.log(`[v0] 15M candles: ${marketData["15m"].length}`)
    console.log(`[v0] 5M candles: ${marketData["5m"].length}`)

    const first1h = marketData["1h"][0]
    const last1h = marketData["1h"][marketData["1h"].length - 1]
    console.log(
      `[v0] 1H data range: ${new Date(first1h.timestamp).toISOString()} to ${new Date(last1h.timestamp).toISOString()}`,
    )
    console.log(`[v0] Current price (last 1H): ${last1h.close}`)

    const signals: BacktestSignal[] = []
    const candles1h = marketData["1h"]

    const rejectionReasons: Record<string, number> = {}

    let candlesChecked = 0
    const trendsDetected = { bullish: 0, bearish: 0, ranging: 0 }

    // Start from candle 100 to have enough history for indicators
    for (let i = 100; i < candles1h.length - 10; i += 10) {
      candlesChecked++
      const currentPrice = candles1h[i].close

      // Create a slice of data up to this point
      const historicalData: Record<Timeframe, Candle[]> = {
        "4h": marketData["4h"].slice(0, Math.floor(i / 4) + 50),
        "1h": marketData["1h"].slice(0, i + 1),
        "15m": marketData["15m"].slice(0, i * 4 + 1),
        "5m": marketData["5m"].slice(0, i * 12 + 1),
      }

      // Check if signal would be generated at this point
      const result = this.checkSignalConditions(historicalData, currentPrice, mode, i)

      const trend1h = this.detectTrend(historicalData["1h"], mode === "conservative" ? "50/200" : "8/21")
      trendsDetected[trend1h]++

      if (!result.signal && result.reason) {
        rejectionReasons[result.reason] = (rejectionReasons[result.reason] || 0) + 1
      }

      if (result.signal) {
        console.log(
          `[v0] ✅ Signal detected at candle ${i}, timestamp: ${new Date(candles1h[i].timestamp).toISOString()}, price ${currentPrice}, direction: ${result.signal.direction}`,
        )

        // Simulate the trade outcome by looking at the next 20 candles
        const futureCandles = candles1h.slice(i + 1, i + 21)
        const tradeOutcome = this.simulateTrade(result.signal, futureCandles)

        signals.push(tradeOutcome)

        // Skip ahead to avoid overlapping signals
        i += 20
      }
    }

    console.log(`[v0] ===== BACKTEST STATISTICS =====`)
    console.log(`[v0] Total candles checked: ${candlesChecked}`)
    console.log(
      `[v0] Trend distribution - Bullish: ${trendsDetected.bullish}, Bearish: ${trendsDetected.bearish}, Ranging: ${trendsDetected.ranging}`,
    )
    console.log(`[v0] ===== REJECTION REASONS =====`)
    Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`[v0] ${reason}: ${count} times (${((count / candlesChecked) * 100).toFixed(1)}%)`)
      })

    console.log(`[v0] Backtest complete. Found ${signals.length} signals.`)
    return this.calculateResults(signals, mode)
  }

  private checkSignalConditions(
    marketData: Record<Timeframe, Candle[]>,
    currentPrice: number,
    mode: "conservative" | "aggressive",
    candleIndex: number,
  ): {
    signal: { direction: Direction; entry: number; stop: number; tp1: number; tp2: number } | null
    reason?: string
  } {
    // Detect trends for each timeframe
    const trend4h = this.detectTrend(marketData["4h"], mode === "conservative" ? "50/200" : "8/21")
    const trend1h = this.detectTrend(marketData["1h"], mode === "conservative" ? "50/200" : "8/21")
    const trend15m = this.detectTrend(marketData["15m"], "8/21")
    const trend5m = this.detectTrend(marketData["5m"], "8/21")

    if (candleIndex % 20 === 0) {
      console.log(`[v0] Candle ${candleIndex}: 4H=${trend4h}, 1H=${trend1h}, 15M=${trend15m}, 5M=${trend5m}`)
    }

    let aligned = false
    let direction: Direction = "ranging"

    if (mode === "conservative") {
      // Conservative: 4H and 1H must align
      aligned = trend4h === trend1h && trend4h !== "ranging"
      direction = aligned ? trend4h : "ranging"

      if (!aligned) {
        return { signal: null, reason: `4h_1h_not_aligned (4H:${trend4h}, 1H:${trend1h})` }
      }
    } else {
      // Aggressive: 1H, 15M, 5M must align
      aligned = trend1h === trend15m && trend1h === trend5m && trend1h !== "ranging"
      direction = aligned ? trend1h : "ranging"

      if (!aligned) {
        return { signal: null, reason: `1h_15m_5m_not_aligned (1H:${trend1h}, 15M:${trend15m}, 5M:${trend5m})` }
      }
    }

    // Check for breakout
    const zones = detectBreakoutZones(marketData["1h"])
    const trendlines = detectTrendlines(marketData["1h"], 50)

    const breakout = checkBreakout(currentPrice, marketData["1h"], zones)
    const trendlineBreakout = checkTrendlineBreakout(currentPrice, marketData["1h"], trendlines)

    const validBreakout = breakout.isBreakout ? breakout : trendlineBreakout.isBreakout ? trendlineBreakout : null

    if (!validBreakout) {
      return { signal: null, reason: "no_breakout_detected" }
    }

    if (validBreakout.direction !== direction) {
      return {
        signal: null,
        reason: `breakout_direction_mismatch (breakout:${validBreakout.direction}, trend:${direction})`,
      }
    }

    // Calculate stops and targets using Chandelier Exit
    const chandelier = calculateChandelierExit(marketData["1h"], 22, 3)
    const chandelierStop =
      direction === "bullish"
        ? chandelier.stopLong[chandelier.stopLong.length - 1]
        : chandelier.stopShort[chandelier.stopShort.length - 1]

    const riskAmount = Math.abs(currentPrice - chandelierStop)
    const tp1 = direction === "bullish" ? currentPrice + riskAmount * 2 : currentPrice - riskAmount * 2
    const tp2 = direction === "bullish" ? currentPrice + riskAmount * 3 : currentPrice - riskAmount * 3

    return {
      signal: {
        direction,
        entry: currentPrice,
        stop: chandelierStop,
        tp1,
        tp2,
      },
    }
  }

  private detectTrend(candles: Candle[], emaType: "50/200" | "8/21"): Direction {
    if (candles.length < 200) return "ranging"

    const closes = candles.map((c) => c.close)

    let fastEMA: number[]
    let slowEMA: number[]

    if (emaType === "50/200") {
      fastEMA = calculateEMA(closes, 50)
      slowEMA = calculateEMA(closes, 200)
    } else {
      fastEMA = calculateEMA(closes, 8)
      slowEMA = calculateEMA(closes, 21)
    }

    const currentFast = fastEMA[fastEMA.length - 1]
    const currentSlow = slowEMA[slowEMA.length - 1]

    if (currentFast > currentSlow * 1.001) return "bullish"
    if (currentFast < currentSlow * 0.999) return "bearish"
    return "ranging"
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
        // Check stop loss first
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
        // Check stop loss first
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
      console.log(`[v0] No signals found for ${mode} mode`)
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
