// Cron job API route - runs every 10 minutes with tiered alerts

import { type NextRequest, NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { tradingEngine } from "@/lib/strategy/engine"
import type { Timeframe } from "@/lib/types/trading"
import { sendTelegramAlert } from "@/lib/telegram/client"
import { getGoldMarketStatus } from "@/lib/utils/market-hours"
import { getMarketContext, shouldAvoidTrading } from "@/lib/market-context/intelligence"
import { tradeHistoryManager } from "@/lib/database/trade-history"
import type { TradeHistory } from "@/lib/types/trading"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Store last alert tier to avoid duplicate alerts
let lastAlertTier = 0
let lastActiveSignal: any | null = null

function calculateAlertTier(scores: { timeframe: Timeframe; score: number }[], marketData: any): number {
  const score4h = scores.find((s) => s.timeframe === "4h")
  const score1h = scores.find((s) => s.timeframe === "1h")
  const score15m = scores.find((s) => s.timeframe === "15m")
  const score5m = scores.find((s) => s.timeframe === "5m")

  if (!score4h || !score1h || !score15m || !score5m) return 0

  const trend4h = tradingEngine.detectTrend(marketData["4h"])
  const trend1h = tradingEngine.detectTrend(marketData["1h"])
  const trend15m = tradingEngine.detectTrend(marketData["15m"])
  const trend5m = tradingEngine.detectTrend(marketData["5m"])

  const conservativeMode = trend4h === trend1h && trend4h !== "ranging"
  const aggressiveMode = trend1h === trend15m && trend1h === trend5m && trend1h !== "ranging"

  // Count strong timeframes
  const strongTimeframes = [score4h.score >= 3, score1h.score >= 2, score15m.score >= 2, score5m.score >= 2].filter(
    Boolean,
  ).length

  // Tier 1: At least 2 strong timeframes
  if (strongTimeframes >= 2) {
    // Tier 2: Partial alignment forming
    const partialAlignment =
      (trend1h === trend15m && trend1h !== "ranging") ||
      (trend15m === trend5m && trend15m !== "ranging") ||
      (trend4h === trend1h && trend4h !== "ranging")

    if (partialAlignment && strongTimeframes >= 2) {
      // Tier 3-4: Full alignment check
      if (aggressiveMode || conservativeMode) {
        let fullTier = 0
        if (score4h.score >= 3) fullTier++
        if (score1h.score >= 2) fullTier++
        if (score15m.score >= 1) fullTier++
        if (score5m.score >= 1) fullTier++

        return fullTier >= 4 ? 4 : Math.max(3, fullTier)
      }
      return 2
    }
    return 1
  }

  return 0
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("[v0] === CRON JOB STARTED ===")
    console.log("[v0] Timestamp:", new Date().toISOString())

    const marketStatus = getGoldMarketStatus()
    console.log("[v0] Market status:", marketStatus.isOpen ? "OPEN" : "CLOSED")

    const marketContext = await getMarketContext()
    const tradingRestriction = shouldAvoidTrading(marketContext)

    if (tradingRestriction.avoid) {
      console.log("[v0] 🚫 Trading blocked:", tradingRestriction.reason)

      // Send notification about trading restriction
      if (marketStatus.isOpen) {
        await sendTelegramAlert({
          type: "status",
          message: `⚠️ Trading suspended: ${tradingRestriction.reason}\n\nThe system will resume normal operation once the event passes.`,
        })
      }

      return NextResponse.json({
        success: true,
        blocked: true,
        reason: tradingRestriction.reason,
        timestamp: new Date().toISOString(),
      })
    }

    // Fetch multi-timeframe data
    const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
    const marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)

    // Get latest price
    const currentPrice = await twelveDataClient.getLatestPrice()

    console.log("[v0] Current XAUUSD price:", currentPrice)

    // Analyze timeframes
    const timeframeScores = timeframes.map((tf) => tradingEngine.analyzeTimeframe(marketData[tf], tf))

    // Calculate alert tier
    const currentTier = calculateAlertTier(timeframeScores, marketData)

    console.log("[v0] Current alert tier:", currentTier)
    console.log("[v0] Last alert tier:", lastAlertTier)
    console.log("[v0] Scores:", timeframeScores.map((s) => `${s.timeframe}: ${s.score}/${s.maxScore}`).join(", "))

    if (lastActiveSignal) {
      const trend1h = tradingEngine.detectTrend(marketData["1h"])
      const trend5m = tradingEngine.detectTrend(marketData["5m"])

      const riskAmount = Math.abs(lastActiveSignal.entryPrice - lastActiveSignal.stopLoss)
      const currentRisk =
        lastActiveSignal.direction === "bullish"
          ? lastActiveSignal.entryPrice - currentPrice
          : currentPrice - lastActiveSignal.entryPrice

      const riskPercentage = (currentRisk / riskAmount) * 100

      const priceNearStop = riskPercentage >= 70
      const priceHitStop =
        (lastActiveSignal.direction === "bullish" && currentPrice <= lastActiveSignal.stopLoss) ||
        (lastActiveSignal.direction === "bearish" && currentPrice >= lastActiveSignal.stopLoss)

      const trendReversed =
        (lastActiveSignal.direction === "bullish" && trend1h === "bearish") ||
        (lastActiveSignal.direction === "bearish" && trend1h === "bullish")

      const shortTermReversal =
        (lastActiveSignal.direction === "bullish" && trend5m === "bearish") ||
        (lastActiveSignal.direction === "bearish" && trend5m === "bullish")

      if (priceHitStop || priceNearStop || trendReversed || (shortTermReversal && riskPercentage >= 50)) {
        console.log("[v0] ⚠️ REVERSAL DETECTED IN CRON!")

        if (marketStatus.isOpen) {
          let reversalReason = ""
          if (priceHitStop) {
            reversalReason = `🛑 STOP LOSS HIT! Current: $${currentPrice.toFixed(2)}, Stop: $${lastActiveSignal.stopLoss.toFixed(2)}`
          } else if (priceNearStop) {
            reversalReason = `⚠️ DANGER ZONE! Price is ${riskPercentage.toFixed(0)}% towards stop loss ($${lastActiveSignal.stopLoss.toFixed(2)})`
          } else if (trendReversed) {
            reversalReason = `📉 1H TREND REVERSED! Now ${trend1h.toUpperCase()}`
          } else {
            reversalReason = `⚡ 5M TREND REVERSED! Price ${riskPercentage.toFixed(0)}% towards stop`
          }

          await sendTelegramAlert({
            type: "reversal",
            signal: lastActiveSignal,
            message: reversalReason,
            price: currentPrice,
          })

          console.log("[v0] ✅ REVERSAL alert sent from cron")

          const openTrades = tradeHistoryManager.getAllTrades().filter((t) => t.status === "open")
          if (openTrades.length > 0) {
            const trade = openTrades[openTrades.length - 1]
            const pnl =
              lastActiveSignal.direction === "bullish"
                ? currentPrice - trade.entryPrice
                : trade.entryPrice - currentPrice
            const pnlPercent = (pnl / trade.entryPrice) * 100
            const rMultiple = pnl / riskAmount

            tradeHistoryManager.updateTrade(trade.id, {
              exitPrice: currentPrice,
              exitTime: Date.now(),
              pnl,
              pnlPercent,
              rMultiple,
              status: "closed",
              exitReason: reversalReason,
              duration: Date.now() - trade.entryTime,
            })
            console.log("[v0] Trade closed in history:", trade.id, "PNL:", pnl.toFixed(2))
          }

          lastActiveSignal = null
          lastAlertTier = 0
        }
      }
    }

    if (marketStatus.isOpen && currentTier > lastAlertTier && currentTier >= 2) {
      console.log("[v0] Market is open and tier increased! Sending alert...")

      try {
        if (currentTier === 2) {
          console.log("[v0] Sending GET READY alert (2/4)...")
          await sendTelegramAlert({
            type: "get_ready",
            timeframeScores,
            price: currentPrice,
          })
          console.log("[v0] GET READY alert sent successfully")
        } else if (currentTier === 3) {
          console.log("[v0] Sending LIMIT ORDER alert (3/4)...")
          const signal = await tradingEngine.generateSignal(marketData, currentPrice)
          if (signal) {
            await sendTelegramAlert({
              type: "limit_order",
              signal,
            })
            console.log("[v0] LIMIT ORDER alert sent successfully")
            lastActiveSignal = signal

            const tradeRecord: TradeHistory = {
              id: `trade_${Date.now()}`,
              signal,
              entryPrice: signal.entryPrice,
              entryTime: Date.now(),
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              tp1: signal.tp1,
              tp2: signal.tp2,
              status: "open",
            }
            tradeHistoryManager.addTrade(tradeRecord)
            console.log("[v0] Trade recorded in history:", tradeRecord.id)
          } else {
            console.log("[v0] No signal generated for limit order alert")
          }
        } else if (currentTier === 4) {
          console.log("[v0] Sending ENTRY alert (4/4)...")
          const signal = await tradingEngine.generateSignal(marketData, currentPrice)
          if (signal) {
            await sendTelegramAlert({
              type: "entry",
              signal,
            })
            console.log("[v0] ENTRY alert sent successfully")
            lastActiveSignal = signal

            const tradeRecord: TradeHistory = {
              id: `trade_${Date.now()}`,
              signal,
              entryPrice: signal.entryPrice,
              entryTime: Date.now(),
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              tp1: signal.tp1,
              tp2: signal.tp2,
              status: "open",
            }
            tradeHistoryManager.addTrade(tradeRecord)
            console.log("[v0] Trade recorded in history:", tradeRecord.id)
          } else {
            console.log("[v0] No signal generated for entry alert")
          }
        }

        lastAlertTier = currentTier
        console.log("[v0] Alert tier updated to:", lastAlertTier)
      } catch (telegramError) {
        console.error("[v0] Error sending Telegram alert:", telegramError)
        return NextResponse.json(
          {
            success: false,
            error: `Telegram error: ${telegramError instanceof Error ? telegramError.message : "Unknown"}`,
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        )
      }
    } else if (currentTier === lastAlertTier) {
      console.log("[v0] Tier unchanged, no alert sent")
    } else if (!marketStatus.isOpen) {
      console.log("[v0] Market is closed, no alert sent")
    } else {
      console.log("[v0] Tier below threshold or decreased, no alert sent")
    }

    // Reset if tier drops back to 0 or 1
    if (currentTier <= 1) {
      console.log("[v0] Tier dropped to", currentTier, "- resetting lastAlertTier")
      lastAlertTier = 0
    }

    console.log("[v0] === CRON JOB COMPLETED ===")

    return NextResponse.json({
      success: true,
      currentTier,
      lastAlertTier,
      timeframeScores: timeframeScores.map((s) => ({
        timeframe: s.timeframe,
        score: s.score,
        maxScore: s.maxScore,
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Cron job error:", error)

    await sendTelegramAlert({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
