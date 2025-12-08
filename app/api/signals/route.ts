import { NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { tradingEngine } from "@/lib/strategy/engine"
import { getCurrentSession } from "@/lib/strategy/session-filter"
import { sendTelegramAlert } from "@/lib/telegram/client"
import type { Timeframe, Direction } from "@/lib/types/trading"
import { getGoldMarketStatus, formatMarketHours } from "@/lib/utils/market-hours"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function calculateConfirmationTier(timeframeScores: any[]): number {
  const score4h = timeframeScores.find((s) => s.timeframe === "4h")
  const score1h = timeframeScores.find((s) => s.timeframe === "1h")
  const score15m = timeframeScores.find((s) => s.timeframe === "15m")
  const score5m = timeframeScores.find((s) => s.timeframe === "5m")

  if (!score4h || !score1h || !score15m || !score5m) return 0

  let tier = 0
  if (score4h.score >= 3) tier++
  if (score1h.score >= 2) tier++
  if (score15m.score >= 1) tier++
  if (score5m.score >= 1) tier++

  return tier
}

function generatePreviewTrade(
  marketData: Record<Timeframe, any[]>,
  currentPrice: number,
  tier: number,
  trend4h: any,
  trend1h: any,
): any | null {
  console.log("[v0] generatePreviewTrade called with tier:", tier, "trend4h:", trend4h, "trend1h:", trend1h)

  if (tier < 3) {
    console.log("[v0] Tier < 3, returning null")
    return null
  }

  const candles1h = marketData["1h"]
  if (!candles1h || candles1h.length < 50) {
    console.log("[v0] Not enough candles, returning null")
    return null
  }

  const atr =
    candles1h
      .slice(-14)
      .map((c: any) => c.high - c.low)
      .reduce((a: number, b: number) => a + b, 0) / 14

  const direction = trend1h === "bullish" ? "bullish" : trend1h === "bearish" ? "bearish" : trend4h

  console.log("[v0] Direction determined:", direction)

  if (direction === "ranging") {
    console.log("[v0] Direction is ranging, returning null")
    return null
  }

  const isBullish = direction === "bullish"

  const entryPrice = currentPrice
  const stopLoss = isBullish ? currentPrice - atr * 2 : currentPrice + atr * 2
  const chandelierStop = isBullish ? currentPrice - atr * 3 : currentPrice + atr * 3

  // Calculate TP1 (2R) and TP2 (3R)
  const riskAmount = Math.abs(entryPrice - stopLoss)
  const tp1 = isBullish ? entryPrice + riskAmount * 2 : entryPrice - riskAmount * 2
  const tp2 = isBullish ? entryPrice + riskAmount * 3 : entryPrice - riskAmount * 3

  const previewTrade = {
    id: `preview_${Date.now()}`,
    timestamp: Date.now(),
    direction,
    entryPrice,
    stopLoss,
    takeProfit: tp1,
    tp1,
    tp2,
    chandelierStop,
    status: tier === 3 ? "pending" : "active",
    breakoutZone: {
      level: currentPrice,
      type: isBullish ? "resistance" : "support",
      touches: 3,
    },
    volatility: {
      atr,
      rangeExpansion: true,
      rangeCompression: false,
      volatilityScore: 7,
    },
    timeframeScores: [],
    session: getCurrentSession(),
  }

  console.log("[v0] Generated preview trade successfully:", previewTrade)

  return previewTrade
}

let lastAlertTier = 0
let lastActiveSignal: any | null = null

export async function GET() {
  try {
    console.log("[v0] === NEW API CALL ===")
    console.log("[v0] Fetching market data from API...")

    const marketStatus = getGoldMarketStatus()
    const marketStatusMessage = formatMarketHours(marketStatus)

    console.log("[v0] Market status:", marketStatus.isOpen ? "OPEN" : "CLOSED")

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
          activeSignal: null,
          isMarketOpen: marketStatus.isOpen,
          marketStatusMessage: apiError ? `API Error: ${apiError}` : marketStatusMessage,
          lastUpdate: Date.now(),
        },
      })
    }

    const timeframeScores = Object.keys(marketData).map((tf) =>
      tradingEngine.analyzeTimeframe(marketData[tf as Timeframe], tf as Timeframe),
    )

    const trend4h = tradingEngine.detectTrend(marketData["4h"])
    const trend1h = tradingEngine.detectTrend(marketData["1h"])

    const isChopRange = tradingEngine.detectChopRange(marketData["1h"])
    const volatility = tradingEngine.calculateVolatilityMetrics(marketData["1h"])
    const currentSession = getCurrentSession()

    const confirmationTier = calculateConfirmationTier(timeframeScores)

    console.log("[v0] === SIGNAL GENERATION ===")
    console.log("[v0] Confirmation tier:", confirmationTier)
    console.log("[v0] Scores:", {
      "4h": timeframeScores.find((s) => s.timeframe === "4h")?.score,
      "1h": timeframeScores.find((s) => s.timeframe === "1h")?.score,
      "15m": timeframeScores.find((s) => s.timeframe === "15m")?.score,
      "5m": timeframeScores.find((s) => s.timeframe === "5m")?.score,
    })
    console.log("[v0] Trends - 4h:", trend4h, "1h:", trend1h)

    if (marketStatus.isOpen && confirmationTier !== lastAlertTier && confirmationTier >= 2) {
      console.log("[v0] Market is open and tier changed, sending Telegram alert...")

      try {
        if (confirmationTier === 2) {
          console.log("[v0] Sending GET READY alert...")
          await sendTelegramAlert({
            type: "get_ready",
            timeframeScores,
            price: currentPrice,
          })
          console.log("[v0] GET READY alert sent successfully")
        } else if (confirmationTier === 3) {
          console.log("[v0] Sending LIMIT ORDER alert...")
          const previewSignal = generatePreviewTrade(marketData, currentPrice, 3, trend4h, trend1h)
          if (previewSignal) {
            await sendTelegramAlert({
              type: "limit_order",
              signal: previewSignal,
            })
            console.log("[v0] LIMIT ORDER alert sent successfully")
          } else {
            console.log("[v0] Failed to generate preview signal for limit order alert")
          }
        } else if (confirmationTier === 4) {
          console.log("[v0] Sending ENTRY alert...")
          let entrySignal = await tradingEngine.generateSignal(marketData, currentPrice)
          if (!entrySignal) {
            console.log("[v0] No full signal, using preview for entry alert")
            entrySignal = generatePreviewTrade(marketData, currentPrice, 4, trend4h, trend1h)
          }
          if (entrySignal) {
            await sendTelegramAlert({
              type: "entry",
              signal: entrySignal,
            })
            console.log("[v0] ENTRY alert sent successfully")
          } else {
            console.log("[v0] Failed to generate signal for entry alert")
          }
        }
        lastAlertTier = confirmationTier
      } catch (telegramError) {
        console.error("[v0] Error sending Telegram alert:", telegramError)
      }
    } else {
      if (!marketStatus.isOpen) {
        console.log("[v0] No alert sent - market is closed")
      } else {
        console.log("[v0] No alert sent - tier unchanged or below threshold")
      }
    }

    let activeSignal = null
    console.log("[v0] Attempting to generate active signal for display...")

    if (confirmationTier >= 3) {
      console.log("[v0] Tier >= 3, generating signal...")

      if (confirmationTier === 4) {
        console.log("[v0] Tier 4 - trying full signal generation...")
        activeSignal = await tradingEngine.generateSignal(marketData, currentPrice)
        console.log("[v0] Full signal result:", activeSignal ? "SUCCESS" : "NULL")
      }

      if (!activeSignal) {
        console.log("[v0] No full signal, generating preview trade...")
        activeSignal = generatePreviewTrade(marketData, currentPrice, confirmationTier, trend4h, trend1h)
        console.log("[v0] Preview trade result:", activeSignal ? "SUCCESS" : "NULL")
      }
    } else {
      console.log("[v0] Tier < 3, no signal generated")
    }

    console.log("[v0] Final activeSignal:", activeSignal ? "EXISTS" : "NULL")

    if (lastActiveSignal && activeSignal) {
      const priceMovedAgainstTrade =
        (lastActiveSignal.direction === "bullish" && currentPrice < lastActiveSignal.stopLoss) ||
        (lastActiveSignal.direction === "bearish" && currentPrice > lastActiveSignal.stopLoss)

      const trendReversed =
        (lastActiveSignal.direction === "bullish" && trend1h === "bearish") ||
        (lastActiveSignal.direction === "bearish" && trend1h === "bullish")

      if (priceMovedAgainstTrade || trendReversed) {
        console.log("[v0] REVERSAL DETECTED - Price hit stop or trend reversed!")

        if (marketStatus.isOpen) {
          try {
            await sendTelegramAlert({
              type: "reversal",
              signal: lastActiveSignal,
              message: priceMovedAgainstTrade
                ? `Price hit stop loss! Current: $${currentPrice.toFixed(2)}, Stop: $${lastActiveSignal.stopLoss.toFixed(2)}`
                : `Trend reversed! 1H trend now ${trend1h}`,
              price: currentPrice,
            })
            console.log("[v0] REVERSAL alert sent successfully")
          } catch (error) {
            console.error("[v0] Failed to send reversal alert:", error)
          }
        }

        // Clear the signal since it's invalidated
        activeSignal = null
        lastActiveSignal = null
      }
    }

    if (activeSignal) {
      lastActiveSignal = activeSignal
    }

    return NextResponse.json({
      success: true,
      data: {
        currentPrice,
        currentSession,
        trend4h,
        trend1h,
        isChopRange,
        volatility,
        timeframeScores,
        confirmationTier,
        activeSignal,
        isMarketOpen: marketStatus.isOpen,
        marketStatusMessage: apiError ? `API Error: ${apiError}` : marketStatusMessage,
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
        activeSignal: null,
        isMarketOpen: false,
        marketStatusMessage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        lastUpdate: Date.now(),
      },
    })
  }
}
