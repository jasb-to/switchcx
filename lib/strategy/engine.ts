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
import { detectBreakoutZones, checkBreakout, validateBreakoutWithVolume } from "./breakout-detector"
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

    // Criteria checks
    const criteria = {
      adx: !isNaN(latestADX) && latestADX > (timeframe === "1h" ? 15 : 18),
      volume: latestVolume > avgVolume * 1.2,
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

  detectTrend(candles: Candle[]): Direction {
    if (candles.length < 100) {
      return "ranging"
    }

    const ema50 = calculateEMA(candles, 50)
    const ema200 = calculateEMA(candles, 200)

    const latestEMA50 = ema50[ema50.length - 1]
    const latestEMA200 = ema200[ema200.length - 1]

    if (isNaN(latestEMA50) || isNaN(latestEMA200)) {
      return "ranging"
    }

    if (latestEMA50 > latestEMA200) {
      return "bullish"
    } else if (latestEMA50 < latestEMA200) {
      return "bearish"
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

    const trend4h = this.detectTrend(marketData["4h"])
    const trend1h = this.detectTrend(marketData["1h"])
    const trend15m = this.detectTrend(marketData["15m"])
    const trend5m = this.detectTrend(marketData["5m"])

    const conservativeMode = trend4h === trend1h && trend4h !== "ranging" && trend1h !== "ranging"
    const aggressiveMode =
      allowEarlyEntry &&
      trend1h !== "ranging" &&
      trend15m !== "ranging" &&
      trend5m !== "ranging" &&
      trend1h === trend15m &&
      trend1h === trend5m

    if (!conservativeMode && !aggressiveMode) {
      if (!conservativeMode) {
        console.log("[v0] Conservative mode failed - 4H:", trend4h, "1H:", trend1h)
      }
      if (!aggressiveMode) {
        console.log("[v0] Aggressive mode failed - 1H:", trend1h, "15M:", trend15m, "5M:", trend5m)
      }
      return null
    }

    const signalMode = conservativeMode ? "conservative" : "aggressive"
    console.log("[v0] Signal mode:", signalMode)

    const requiredStrongConfirmations = conservativeMode ? 2 : 1
    const requiredModerateConfirmations = conservativeMode ? 2 : 3

    const strongConfirmations = [
      score4h.score >= 3,
      score1h.score >= 3,
      score15m.score >= 3,
      score5m.score >= 3,
    ].filter(Boolean).length
    const moderateConfirmations = [
      score4h.score >= 2,
      score1h.score >= 2,
      score15m.score >= 2,
      score5m.score >= 2,
    ].filter(Boolean).length

    if (strongConfirmations < requiredStrongConfirmations && moderateConfirmations < requiredModerateConfirmations) {
      console.log("[v0] Insufficient confirmations for", signalMode, "mode", {
        required: conservativeMode ? "2 strong or 2 moderate" : "1 strong or 3 moderate",
        score4h: score4h.score,
        score1h: score1h.score,
        score15m: score15m.score,
        score5m: score5m.score,
      })
      return null
    }

    const isChop = this.detectChopRange(marketData["1h"])
    if (isChop && moderateConfirmations < 2) {
      console.log("[v0] Market in chop range with insufficient confirmations")
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

    const breakout = checkBreakout(currentPrice, marketData["1h"], zones)
    console.log("[v0] Breakout check result:", breakout)

    if (!breakout.isBreakout || !breakout.zone) {
      console.log("[v0] No confirmed breakout detected - signal rejected")
      return null
    }

    if (conservativeMode && (breakout.direction !== trend4h || breakout.direction !== trend1h)) {
      console.log(
        "[v0] Breakout direction conflicts with higher timeframes - 4H:",
        trend4h,
        "1H:",
        trend1h,
        "Breakout:",
        breakout.direction,
      )
      return null
    }

    if (aggressiveMode && breakout.direction !== trend1h) {
      console.log("[v0] Breakout direction conflicts with 1H trend - 1H:", trend1h, "Breakout:", breakout.direction)
      return null
    }

    const volumeValid = validateBreakoutWithVolume(marketData["1h"])
    if (!volumeValid && strongConfirmations < 2) {
      console.log("[v0] Volume validation failed for moderate conviction setup")
      return null
    }

    const candles5m = marketData["5m"]
    const confirmed5m =
      (breakout.direction === "bullish" && (trend5m === "bullish" || trend5m === "ranging")) ||
      (breakout.direction === "bearish" && (trend5m === "bearish" || trend5m === "ranging"))

    if (!confirmed5m) {
      console.log("[v0] 5m trend alignment failed - 5m trend:", trend5m, "signal direction:", breakout.direction)
      return null
    }

    // Calculate Chandelier Exit
    const chandelier = calculateChandelierExit(marketData["1h"], 22, 3)
    const chandelierStop =
      breakout.direction === "bullish"
        ? chandelier.stopLong[chandelier.stopLong.length - 1]
        : chandelier.stopShort[chandelier.stopShort.length - 1]

    // Calculate TP1 (2R) and TP2 (3R)
    const riskAmount = Math.abs(currentPrice - chandelierStop)
    const tp1 = breakout.direction === "bullish" ? currentPrice + riskAmount * 2 : currentPrice - riskAmount * 2
    const tp2 = breakout.direction === "bullish" ? currentPrice + riskAmount * 3 : currentPrice - riskAmount * 3

    // Generate signal
    const signal: TradingSignal = {
      id: `signal_${Date.now()}`,
      timestamp: Date.now(),
      direction: breakout.direction,
      entryPrice: currentPrice,
      stopLoss: chandelierStop,
      takeProfit: tp1,
      tp1,
      tp2,
      chandelierStop,
      status: "active",
      breakoutZone: breakout.zone,
      volatility,
      timeframeScores,
      session,
      metadata: {
        signalMode, // Track which mode generated the signal
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
