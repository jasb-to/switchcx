import { NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { tradingEngine } from "@/lib/strategy/engine"
import { getCurrentSession } from "@/lib/strategy/session-filter"
import type { Timeframe, Direction } from "@/lib/types/trading"
import { getGoldMarketStatus, formatMarketHours } from "@/lib/utils/market-hours"
import { getMarketContext, shouldAvoidTrading } from "@/lib/market-context/intelligence"
import { calculateSignalConfidence } from "@/lib/strategy/confidence-scorer"
import { tradeHistoryManager } from "@/lib/database/trade-history"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function calculateConfirmationTier(
  timeframeScores: any[],
  trend4h: Direction,
  trend1h: Direction,
  trend15m: Direction,
  trend5m: Direction,
): { tier: number; mode: "conservative" | "aggressive" | "none" } {
  const score4h = timeframeScores.find((s) => s.timeframe === "4h")
  const score1h = timeframeScores.find((s) => s.timeframe === "1h")
  const score15m = timeframeScores.find((s) => s.timeframe === "15m")
  const score5m = timeframeScores.find((s) => s.timeframe === "5m")

  if (!score4h || !score1h || !score15m || !score5m) return { tier: 0, mode: "none" }

  const conservativeMode = trend4h === trend1h && trend4h !== "ranging" && trend1h !== "ranging"
  const aggressiveMode =
    trend1h !== "ranging" &&
    trend15m !== "ranging" &&
    trend5m !== "ranging" &&
    trend1h === trend15m &&
    trend1h === trend5m

  if (!conservativeMode && !aggressiveMode) {
    return { tier: 0, mode: "none" }
  }

  let tier = 0
  if (score4h.score >= 3) tier++
  if (score1h.score >= 2) tier++
  if (score15m.score >= 1) tier++
  if (score5m.score >= 1) tier++

  return {
    tier,
    mode: conservativeMode ? "conservative" : "aggressive",
  }
}

export async function GET() {
  try {
    console.log("[v0] Dashboard fetching market data...")

    const marketStatus = getGoldMarketStatus()
    const marketStatusMessage = formatMarketHours(marketStatus)

    const marketContext = await getMarketContext()
    const tradingRestriction = shouldAvoidTrading(marketContext)

    if (tradingRestriction.avoid) {
      console.log("[v0] Trading blocked due to news:", tradingRestriction.reason)
    }

    let marketData: Record<Timeframe, any[]> = {
      "4h": [],
      "1h": [],
      "15m": [],
      "5m": [],
    }
    let currentPrice = 0
    let apiError = null

    try {
      const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
      marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)
      currentPrice = await twelveDataClient.getLatestPrice()
    } catch (apiCallError) {
      console.error("[v0] API call failed:", apiCallError)
      apiError = apiCallError instanceof Error ? apiCallError.message : "API unavailable"

      // Return a safe response when API fails
      return NextResponse.json({
        success: true,
        data: {
          currentPrice: 0,
          currentSession: getCurrentSession(),
          trend4h: "ranging" as Direction,
          trend1h: "ranging" as Direction,
          trend15m: "ranging" as Direction, // Add 15M trend to response
          trend5m: "ranging" as Direction, // Add 5M trend to response
          isChopRange: true,
          volatility: {
            atr: 0,
            rangeExpansion: false,
            rangeCompression: false,
            volatilityScore: 0,
          },
          timeframeScores: [
            {
              timeframe: "4h",
              score: 0,
              maxScore: 5,
              criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
              adxValue: 0,
            },
            {
              timeframe: "1h",
              score: 0,
              maxScore: 5,
              criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
              adxValue: 0,
            },
            {
              timeframe: "15m",
              score: 0,
              maxScore: 5,
              criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
              adxValue: 0,
            },
            {
              timeframe: "5m",
              score: 0,
              maxScore: 5,
              criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
              adxValue: 0,
            },
          ],
          confirmationTier: 0,
          signalMode: "none", // Add signal mode to response
          activeSignal: null,
          rejectionReason: null,
          signalConfidence: null,
          marketContext: null,
          performanceMetrics: null,
          isMarketOpen: marketStatus.isOpen,
          marketStatusMessage: apiError ? `API Error: ${apiError}` : marketStatusMessage,
          newsFilterActive: tradingRestriction.avoid,
          newsFilterReason: tradingRestriction.reason,
          lastUpdate: Date.now(),
        },
      })
    }

    const timeframeScores = Object.keys(marketData).map((tf) =>
      tradingEngine.analyzeTimeframe(marketData[tf as Timeframe], tf as Timeframe),
    )

    const enhancedTimeframeScores = timeframeScores.map((score) => ({
      ...score,
      trendDirection: tradingEngine.detectTrend(marketData[score.timeframe]),
    }))

    const trend4h = tradingEngine.detectTrend(marketData["4h"])
    const trend1h = tradingEngine.detectTrend(marketData["1h"])
    const trend15m = tradingEngine.detectTrend(marketData["15m"])
    const trend5m = tradingEngine.detectTrend(marketData["5m"])

    const isChopRange = tradingEngine.detectChopRange(marketData["1h"])
    const volatility = tradingEngine.calculateVolatilityMetrics(marketData["1h"])
    const currentSession = getCurrentSession()

    const confirmationResult = calculateConfirmationTier(enhancedTimeframeScores, trend4h, trend1h, trend15m, trend5m)
    const confirmationTier = confirmationResult.tier
    const signalMode = confirmationResult.mode

    console.log("[v0] Confirmation tier:", confirmationTier, "Mode:", signalMode)
    console.log("[v0] Trends - 4h:", trend4h, "1h:", trend1h, "15m:", trend15m, "5m:", trend5m)

    let activeSignal = null
    let rejectionReason = null
    let signalConfidence = null

    if (tradingRestriction.avoid) {
      rejectionReason = `Trading suspended: ${tradingRestriction.reason}`
    } else if (confirmationTier >= 3 && signalMode !== "none") {
      console.log("[v0] Attempting to generate signal for dashboard display... Mode:", signalMode)
      activeSignal = await tradingEngine.generateSignal(marketData, currentPrice, true)

      if (activeSignal) {
        signalConfidence = calculateSignalConfidence(activeSignal, marketContext, enhancedTimeframeScores)
        if (signalMode === "aggressive") {
          signalConfidence = {
            ...signalConfidence,
            score: Math.max(5, signalConfidence.score - 2), // Reduce by 2 points for early entry
            recommendation: signalConfidence.score >= 7 ? "take" : "consider",
          }
        }
        console.log(
          "[v0] Signal confidence:",
          signalConfidence.score,
          "- Recommendation:",
          signalConfidence.recommendation,
          "- Mode:",
          signalMode,
        )
      }

      console.log("[v0] Signal for display:", activeSignal ? "EXISTS" : "NULL")
    } else {
      if (signalMode === "none") {
        rejectionReason = `Timeframe misalignment: Need either (4H+1H) or (1H+15M+5M) aligned. Current: 4H=${trend4h}, 1H=${trend1h}, 15M=${trend15m}, 5M=${trend5m}`
        console.log("[v0] No signal - timeframes not aligned in any mode")
      } else {
        rejectionReason = `Insufficient confirmations: Only ${confirmationTier}/4 criteria met`
        console.log("[v0] No signal - tier < 3")
      }
    }

    const performanceMetrics = tradeHistoryManager.calculatePerformanceMetrics()

    return NextResponse.json({
      success: true,
      data: {
        currentPrice,
        currentSession,
        trend4h,
        trend1h,
        trend15m, // Add 15M trend to response
        trend5m, // Add 5M trend to response
        isChopRange,
        volatility,
        timeframeScores: enhancedTimeframeScores,
        confirmationTier,
        signalMode, // Add signal mode to response
        activeSignal,
        rejectionReason,
        signalConfidence,
        marketContext,
        performanceMetrics,
        isMarketOpen: marketStatus.isOpen,
        marketStatusMessage: apiError ? `API Error: ${apiError}` : marketStatusMessage,
        newsFilterActive: tradingRestriction.avoid,
        newsFilterReason: tradingRestriction.reason,
        lastUpdate: Date.now(),
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching signals:", error)
    return NextResponse.json({
      success: true,
      data: {
        currentPrice: 0,
        currentSession: getCurrentSession(),
        trend4h: "ranging" as Direction,
        trend1h: "ranging" as Direction,
        trend15m: "ranging" as Direction, // Add 15M trend to response
        trend5m: "ranging" as Direction, // Add 5M trend to response
        isChopRange: true,
        volatility: {
          atr: 0,
          rangeExpansion: false,
          rangeCompression: false,
          volatilityScore: 0,
        },
        timeframeScores: [
          {
            timeframe: "4h",
            score: 0,
            maxScore: 5,
            criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
            adxValue: 0,
          },
          {
            timeframe: "1h",
            score: 0,
            maxScore: 5,
            criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
            adxValue: 0,
          },
          {
            timeframe: "15m",
            score: 0,
            maxScore: 5,
            criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
            adxValue: 0,
          },
          {
            timeframe: "5m",
            score: 0,
            maxScore: 5,
            criteria: { adx: false, volume: false, emaAlignment: false, trendDirection: false, volatility: false },
            adxValue: 0,
          },
        ],
        confirmationTier: 0,
        signalMode: "none", // Add signal mode to response
        activeSignal: null,
        rejectionReason: `System error: ${error instanceof Error ? error.message : "Unknown error"}`,
        signalConfidence: null,
        marketContext: null,
        performanceMetrics: null,
        isMarketOpen: false,
        marketStatusMessage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        newsFilterActive: false,
        newsFilterReason: null,
        lastUpdate: Date.now(),
      },
    })
  }
}
