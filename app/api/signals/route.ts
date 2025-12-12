import { NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { tradingEngine } from "@/lib/strategy/engine"
import { getCurrentSession } from "@/lib/strategy/session-filter"
import type { Timeframe, Direction } from "@/lib/types/trading"
import { getGoldMarketStatus, formatMarketHours } from "@/lib/utils/market-hours"
import { getMarketContext, shouldAvoidTrading } from "@/lib/market-context/intelligence"
import { calculateSignalConfidence } from "@/lib/strategy/confidence-scorer"
import { tradeHistoryManager } from "@/lib/database/trade-history"
import { calculateChandelierExit } from "@/lib/strategy/indicators"
import { calculateConfirmationTier } from "@/lib/strategy/tier-calculator"
import { signalStore } from "@/lib/cache/signal-store"
import { sendTelegramAlert } from "@/lib/telegram/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try {
    const marketStatus = getGoldMarketStatus()
    const marketStatusMessage = formatMarketHours(marketStatus)

    const marketContext = await getMarketContext()
    const tradingRestriction = shouldAvoidTrading(marketContext)

    const existingSignal = signalStore.getActiveSignal()
    if (existingSignal) {
      const performanceMetrics = tradeHistoryManager.calculatePerformanceMetrics()
      let currentPrice = existingSignal.entry
      try {
        currentPrice = await twelveDataClient.getLatestPrice()
      } catch (priceError) {
        console.warn("[v0] Could not fetch current price, using signal entry price:", priceError)
      }

      return NextResponse.json({
        success: true,
        data: {
          currentPrice,
          currentSession: getCurrentSession(),
          trend4h: existingSignal.direction === "bullish" ? "bullish" : "bearish",
          trend1h: existingSignal.direction === "bullish" ? "bullish" : "bearish",
          trend15m: existingSignal.direction === "bullish" ? "bullish" : "bearish",
          trend5m: existingSignal.direction === "bullish" ? "bullish" : "bearish",
          isChopRange: false,
          volatility: existingSignal.volatility,
          timeframeScores: existingSignal.timeframeScores,
          confirmationTier: 4,
          signalMode: existingSignal.mode || "aggressive",
          activeSignal: existingSignal,
          rejectionReason: null,
          signalConfidence: existingSignal.confidence,
          marketContext,
          performanceMetrics,
          isMarketOpen: marketStatus.isOpen,
          marketStatusMessage,
          newsFilterActive: tradingRestriction.avoid,
          newsFilterReason: tradingRestriction.reason,
          lastUpdate: Date.now(),
          signalAge: signalStore.getSignalAge(),
        },
      })
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
      console.error("API call failed:", apiCallError)
      const errorMessage = apiCallError instanceof Error ? apiCallError.message : "API unavailable"
      const isRateLimitError = errorMessage.includes("Daily API limit") || errorMessage.includes("API credits")
      apiError = isRateLimitError
        ? "⚠️ Daily API limit reached. Service resumes at midnight UTC. Active signals are still being monitored."
        : `API Error: ${errorMessage}`

      return NextResponse.json({
        success: true,
        data: {
          currentPrice: 0,
          currentSession: getCurrentSession(),
          trend4h: "ranging" as Direction,
          trend1h: "ranging" as Direction,
          trend15m: "ranging" as Direction,
          trend5m: "ranging" as Direction,
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
          signalMode: "none",
          activeSignal: null,
          rejectionReason: apiError,
          signalConfidence: null,
          marketContext: null,
          performanceMetrics: null,
          isMarketOpen: marketStatus.isOpen,
          marketStatusMessage: apiError,
          newsFilterActive: tradingRestriction.avoid,
          newsFilterReason: tradingRestriction.reason,
          lastUpdate: Date.now(),
        },
      })
    }

    const timeframeScores = Object.keys(marketData).map((tf) =>
      tradingEngine.analyzeTimeframe(marketData[tf as Timeframe], tf as Timeframe),
    )

    const enhancedTimeframeScores = timeframeScores.map((score) => {
      const candles = marketData[score.timeframe]
      const chandelier = calculateChandelierExit(candles, 22, 3)

      return {
        ...score,
        trendDirection: tradingEngine.detectTrend(candles),
        chandelierLong: chandelier.stopLong[chandelier.stopLong.length - 1],
        chandelierShort: chandelier.stopShort[chandelier.stopShort.length - 1],
      }
    })

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

    let activeSignal = null
    let rejectionReason = null
    let signalConfidence = null

    if (tradingRestriction.avoid) {
      rejectionReason = `Trading suspended: ${tradingRestriction.reason}`
    } else if (confirmationTier >= 3 && signalMode !== "none") {
      activeSignal = await tradingEngine.generateSignal(marketData, currentPrice, signalMode === "aggressive")

      if (activeSignal) {
        signalConfidence = calculateSignalConfidence(activeSignal, marketContext, enhancedTimeframeScores)
        if (signalMode === "aggressive") {
          signalConfidence = {
            ...signalConfidence,
            score: Math.max(5, signalConfidence.score - 2),
            recommendation: signalConfidence.score >= 7 ? "take" : "consider",
          }
        }

        if (marketStatus.isOpen) {
          try {
            if (confirmationTier === 3 && signalMode === "aggressive") {
              await sendTelegramAlert({
                type: "limit_order",
                signal: activeSignal,
                confidence: signalConfidence,
                timeframeScores: enhancedTimeframeScores,
                price: currentPrice,
              })
              console.log("[v0] ✅ IMMEDIATE Telegram alert sent for tier 3 aggressive signal")
            } else if (confirmationTier === 4) {
              await sendTelegramAlert({
                type: "limit_order",
                signal: activeSignal,
                confidence: signalConfidence,
                timeframeScores: enhancedTimeframeScores,
                price: currentPrice,
              })
              console.log("[v0] ✅ IMMEDIATE Telegram alert sent for tier 4 signal")
            }
          } catch (telegramError) {
            console.error("[v0] ❌ Failed to send immediate Telegram alert:", telegramError)
          }
        }

        signalStore.setActiveSignal(activeSignal)
      }
    } else {
      if (signalMode === "none") {
        rejectionReason = `Timeframe misalignment: Need either (4H+1H) or (1H+15M+5M) aligned. Current: 4H=${trend4h}, 1H=${trend1h}, 15M=${trend15m}, 5M=${trend5m}`
      } else {
        rejectionReason = `Insufficient confirmations: Only ${confirmationTier}/4 criteria met`
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
        trend15m,
        trend5m,
        isChopRange,
        volatility,
        timeframeScores: enhancedTimeframeScores,
        confirmationTier,
        signalMode,
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
    console.error("Error fetching signals:", error)
    return NextResponse.json({
      success: true,
      data: {
        currentPrice: 0,
        currentSession: getCurrentSession(),
        trend4h: "ranging" as Direction,
        trend1h: "ranging" as Direction,
        trend15m: "ranging" as Direction,
        trend5m: "ranging" as Direction,
        isChopRange: true,
        volatility: {
          atr: 0,
          rangeExpansion: false,
          rangeCompression: false,
          volatilityScore: 0,
        },
        timeframeScores: [],
        confirmationTier: 0,
        signalMode: "none",
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
