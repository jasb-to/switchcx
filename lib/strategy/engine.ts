// Main trading strategy engine

import type {
  Candle,
  TradingSignal,
  Direction,
  Timeframe,
  TimeframeScore,
  VolatilityMetrics,
  RiskManagement,
} from "../types/trading"
import {
  calculateEMA,
  calculateATR,
  calculateADX,
  calculateChandelierExit,
  detectVolatilityState,
  calculateVolume,
} from "./indicators"
import { detectBreakoutZones, checkBreakout, detectTrendlines, checkTrendlineBreakout } from "./breakout-detector"
import { getCurrentSession, shouldTradeInSession } from "./session-filter"

export class TradingEngine {
  private readonly timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
  private riskManagement: RiskManagement = {
    maxRiskPerTrade: 2,
    maxTradesPerSession: 3,
    consecutiveLosses: 0,
    lockoutThreshold: 3,
    isLockedOut: false,
    currentSessionTrades: 0,
  }
  private lastStopLossTimestamp = 0
  private readonly cooldownPeriodMs = 2 * 60 * 60 * 1000 // 2 hours cooldown after stop loss

  analyzeTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeScore {
    if (candles.length < 100) {
      return {
        timeframe,
        score: 0,
        maxScore: 5,
        criteria: {
          adx: false,
          volume: false,
          emaAlignment: false,
          trendDirection: false,
          volatility: false,
        },
        adxValue: 0,
      }
    }

    const ema50 = calculateEMA(candles, 50)
    const ema200 = calculateEMA(candles, 200)
    const adx = calculateADX(candles, 14)
    const atr = calculateATR(candles, 14)
    const avgVolume = calculateVolume(candles, 20)

    const latestCandle = candles[candles.length - 1]
    const latestEMA50 = ema50[ema50.length - 1]
    const latestEMA200 = ema200[ema200.length - 1]
    const latestADX = adx[adx.length - 1]
    const latestVolume = latestCandle.volume

    const criteria = {
      adx: !isNaN(latestADX) && latestADX > 12,
      volume: latestVolume > avgVolume * 1.0,
      emaAlignment: !isNaN(latestEMA50) && !isNaN(latestEMA200),
      trendDirection:
        !isNaN(latestEMA50) &&
        !isNaN(latestEMA200) &&
        Math.abs(latestEMA50 - latestEMA200) > latestCandle.close * 0.001,
      volatility: !isNaN(atr[atr.length - 1]) && atr[atr.length - 1] > 0,
    }

    const score = Object.values(criteria).filter(Boolean).length

    return {
      timeframe,
      score,
      maxScore: 5,
      criteria,
      adxValue: isNaN(latestADX) ? 0 : latestADX,
    }
  }

  detectTrend(candles: Candle[], mode: "conservative" | "aggressive" = "conservative"): Direction {
    if (candles.length < 100) {
      return "ranging"
    }

    // Use different EMAs based on mode
    // Conservative: 50/200 (slower, more confirmed trends)
    // Aggressive: 8/21 (faster, catches early momentum)
    const fastPeriod = mode === "aggressive" ? 8 : 50
    const slowPeriod = mode === "aggressive" ? 21 : 200

    const emaFast = calculateEMA(candles, fastPeriod)
    const emaSlow = calculateEMA(candles, slowPeriod)

    const latestEMAFast = emaFast[emaFast.length - 1]
    const latestEMASlow = emaSlow[emaSlow.length - 1]

    if (isNaN(latestEMAFast) || isNaN(latestEMASlow)) {
      return "ranging"
    }

    const recentCandles = candles.slice(-10)
    const currentPrice = candles[candles.length - 1].close

    // Count bullish vs bearish candles in recent price action
    const bullishCandles = recentCandles.filter((c) => c.close > c.open).length
    const bearishCandles = recentCandles.filter((c) => c.close < c.open).length

    // Check if price is trending away from the EMA positioning
    const priceAboveEMAFast = currentPrice > latestEMAFast
    const priceAboveEMASlow = currentPrice > latestEMASlow

    const emaSpread = Math.abs(latestEMAFast - latestEMASlow) / latestEMASlow
    const emasStronglyAligned = emaSpread > 0.003

    // If EMAs are strongly aligned in one direction, trust them
    if (emasStronglyAligned) {
      return latestEMAFast > latestEMASlow ? "bullish" : "bearish"
    }

    // Momentum override: if EMAs say bearish but price action shows bullish momentum
    if (latestEMAFast < latestEMASlow) {
      // EMAs say bearish, but check for bullish momentum
      if (priceAboveEMAFast && bullishCandles >= 5) {
        console.log(
          `[v0] Momentum override (${mode} ${fastPeriod}/${slowPeriod}): detecting early bullish shift (${bullishCandles}/10 bullish candles)`,
        )
        return "bullish"
      }
      return "bearish"
    } else if (latestEMAFast > latestEMASlow) {
      // EMAs say bullish, but check for bearish momentum
      if (!priceAboveEMAFast && bearishCandles >= 5) {
        console.log(
          `[v0] Momentum override (${mode} ${fastPeriod}/${slowPeriod}): detecting early bearish shift (${bearishCandles}/10 bearish candles)`,
        )
        return "bearish"
      }
      return "bullish"
    }

    return "ranging"
  }

  detectChopRange(candles: Candle[]): boolean {
    if (candles.length < 50) {
      return true // Assume chop if not enough data
    }

    const atr = calculateATR(candles, 14)
    const latestATR = atr[atr.length - 1]

    if (isNaN(latestATR)) {
      return true
    }

    // Calculate ATR bands
    const recentATRs = atr.slice(-50).filter((v) => !isNaN(v))
    const avgATR = recentATRs.reduce((a, b) => a + b, 0) / recentATRs.length

    return latestATR < avgATR * 0.5
  }

  calculateVolatilityMetrics(candles: Candle[]): VolatilityMetrics {
    const atr = calculateATR(candles, 14)
    const latestATR = atr[atr.length - 1]

    const volatilityState = detectVolatilityState(candles)

    return {
      atr: latestATR,
      rangeExpansion: volatilityState.expansion,
      rangeCompression: volatilityState.compression,
      volatilityScore: volatilityState.score,
    }
  }

  async generateSignal(
    marketData: Record<Timeframe, Candle[]>,
    currentPrice: number,
    allowEarlyEntry = true,
  ): Promise<TradingSignal | null> {
    console.log("[v0] Generating trading signal...")

    // Check risk management
    if (this.riskManagement.isLockedOut) {
      console.log("[v0] Trading locked out due to consecutive losses")
      return null
    }

    if (this.riskManagement.currentSessionTrades >= this.riskManagement.maxTradesPerSession) {
      console.log("[v0] Max trades per session reached")
      return null
    }

    const now = Date.now()
    if (this.lastStopLossTimestamp > 0 && now - this.lastStopLossTimestamp < this.cooldownPeriodMs) {
      const remainingMinutes = Math.ceil((this.cooldownPeriodMs - (now - this.lastStopLossTimestamp)) / (60 * 1000))
      console.log(`[v0] In cooldown period. ${remainingMinutes} minutes remaining after last stop loss`)
      return null
    }

    // Get session
    const session = getCurrentSession()

    // Analyze each timeframe
    const timeframeScores = this.timeframes.map((tf) => this.analyzeTimeframe(marketData[tf], tf))

    // Check confirmation requirements
    const score4h = timeframeScores.find((s) => s.timeframe === "4h")
    const score1h = timeframeScores.find((s) => s.timeframe === "1h")
    const score15m = timeframeScores.find((s) => s.timeframe === "15m")
    const score5m = timeframeScores.find((s) => s.timeframe === "5m")

    if (!score4h || !score1h || !score15m || !score5m) {
      console.log("[v0] Missing timeframe analysis")
      return null
    }

    // Check conservative mode with 50/200 EMAs
    const trend4h_conservative = this.detectTrend(marketData["4h"], "conservative")
    const trend1h_conservative = this.detectTrend(marketData["1h"], "conservative")

    const conservativeMode =
      trend4h_conservative === trend1h_conservative &&
      trend4h_conservative !== "ranging" &&
      trend1h_conservative !== "ranging"

    // Check aggressive mode with 8/21 EMAs
    const trend1h_aggressive = this.detectTrend(marketData["1h"], "aggressive")
    const trend15m_aggressive = this.detectTrend(marketData["15m"], "aggressive")
    const trend5m_aggressive = this.detectTrend(marketData["5m"], "aggressive")

    const aggressiveMode =
      allowEarlyEntry &&
      trend1h_aggressive !== "ranging" &&
      trend15m_aggressive !== "ranging" &&
      trend5m_aggressive !== "ranging" &&
      trend1h_aggressive === trend15m_aggressive &&
      trend1h_aggressive === trend5m_aggressive

    if (!conservativeMode && !aggressiveMode) {
      if (!conservativeMode) {
        console.log(
          "[v0] Conservative mode (50/200 EMA) failed - 4H:",
          trend4h_conservative,
          "1H:",
          trend1h_conservative,
        )
      }
      if (!aggressiveMode) {
        console.log(
          "[v0] Aggressive mode (8/21 EMA) failed - 1H:",
          trend1h_aggressive,
          "15M:",
          trend15m_aggressive,
          "5M:",
          trend5m_aggressive,
        )
      }
      return null
    }

    const signalMode = conservativeMode ? "conservative" : "aggressive"
    console.log("[v0] Signal mode:", signalMode, signalMode === "conservative" ? "(50/200 EMA)" : "(8/21 EMA)")

    // Use the trends from the appropriate mode for the rest of signal generation
    const trend4h = conservativeMode ? trend4h_conservative : trend4h_conservative
    const trend1h = conservativeMode ? trend1h_conservative : trend1h_aggressive
    const trend15m = aggressiveMode ? trend15m_aggressive : this.detectTrend(marketData["15m"], "conservative")
    const trend5m = aggressiveMode ? trend5m_aggressive : this.detectTrend(marketData["5m"], "conservative")

    // No need for complex score requirements - the breakout is the key signal

    const isChop = this.detectChopRange(marketData["1h"])
    if (isChop) {
      console.log("[v0] Market in chop range - signal rejected")
      return null
    }

    // Get volatility metrics
    const volatility = this.calculateVolatilityMetrics(marketData["1h"])

    // Check session filter
    if (!shouldTradeInSession(session, volatility.volatilityScore)) {
      console.log("[v0] Session filter failed")
      return null
    }

    const zones = detectBreakoutZones(marketData["1h"])
    console.log("[v0] Detected zones:", zones.length)

    const trendlines = detectTrendlines(marketData["1h"], 50)
    console.log("[v0] Detected trendlines:", trendlines.length)

    const breakout = checkBreakout(currentPrice, marketData["1h"], zones)
    const trendlineBreakout = checkTrendlineBreakout(currentPrice, marketData["1h"], trendlines)

    console.log("[v0] Breakout check result:", breakout)
    console.log("[v0] Trendline breakout check result:", trendlineBreakout)

    const validBreakout = breakout.isBreakout ? breakout : trendlineBreakout.isBreakout ? trendlineBreakout : null

    if (!validBreakout) {
      console.log("[v0] No confirmed breakout detected (horizontal or trendline) - signal rejected")
      return null
    }

    const candles5m = marketData["5m"]
    const stronglyOpposing =
      (validBreakout.direction === "bullish" && trend5m === "bearish") ||
      (validBreakout.direction === "bearish" && trend5m === "bullish")

    if (stronglyOpposing) {
      console.log("[v0] 5m trend strongly opposing - signal rejected")
      return null
    }

    // Calculate Chandelier Exit
    const chandelier = calculateChandelierExit(marketData["1h"], 22, 3)
    const chandelierStop =
      validBreakout.direction === "bullish"
        ? chandelier.stopLong[chandelier.stopLong.length - 1]
        : chandelier.stopShort[chandelier.stopShort.length - 1]

    // Calculate TP1 (2R) and TP2 (3R)
    const riskAmount = Math.abs(currentPrice - chandelierStop)
    const tp1 = validBreakout.direction === "bullish" ? currentPrice + riskAmount * 2 : currentPrice - riskAmount * 2
    const tp2 = validBreakout.direction === "bullish" ? currentPrice + riskAmount * 3 : currentPrice - riskAmount * 3

    // Generate signal
    const signal: TradingSignal = {
      id: `signal_${Date.now()}`,
      timestamp: Date.now(),
      direction: validBreakout.direction,
      entryPrice: currentPrice,
      stopLoss: chandelierStop,
      takeProfit: tp1,
      tp1,
      tp2,
      chandelierStop,
      status: "active",
      breakoutZone: "zone" in validBreakout ? validBreakout.zone : undefined,
      volatility,
      timeframeScores,
      session,
      metadata: {
        signalMode,
        breakoutType: "zone" in validBreakout ? "horizontal" : "trendline",
      },
    }

    this.riskManagement.currentSessionTrades++

    console.log("[v0] Signal generated successfully:", signal)
    return signal
  }

  recordStopLoss(): void {
    this.lastStopLossTimestamp = Date.now()
    console.log("[v0] Stop loss recorded - 2 hour cooldown period started")
  }

  updateRiskManagement(signalClosed: TradingSignal): void {
    if (signalClosed.pnl && signalClosed.pnl < 0) {
      this.riskManagement.consecutiveLosses++

      if (this.riskManagement.consecutiveLosses >= this.riskManagement.lockoutThreshold) {
        this.riskManagement.isLockedOut = true
        console.log("[v0] Trading locked out after", this.riskManagement.consecutiveLosses, "consecutive losses")
      }
    } else {
      this.riskManagement.consecutiveLosses = 0
      this.riskManagement.isLockedOut = false
    }
  }

  resetSessionTrades(): void {
    this.riskManagement.currentSessionTrades = 0
  }

  getRiskManagement(): RiskManagement {
    return { ...this.riskManagement }
  }
}

export const tradingEngine = new TradingEngine()
