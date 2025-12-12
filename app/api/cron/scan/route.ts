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
import { calculateSignalConfidence } from "@/lib/strategy/confidence-scorer"
import { calculateChandelierExit } from "@/lib/strategy/indicators"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Store last alert tier to avoid duplicate alerts
let lastAlertTier = 0
let lastActiveSignal: any | null = null

function calculateAlertTier(
  scores: { timeframe: Timeframe; score: number }[],
  marketData: any,
): { tier: number; mode: string; debugInfo: any } {
  const score4h = scores.find((s) => s.timeframe === "4h")
  const score1h = scores.find((s) => s.timeframe === "1h")
  const score15m = scores.find((s) => s.timeframe === "15m")
  const score5m = scores.find((s) => s.timeframe === "5m")

  if (!score4h || !score1h || !score15m || !score5m) {
    console.log("[v0] CRON TIER CALC - Missing score data")
    return { tier: 0, mode: "none", debugInfo: { error: "Missing scores" } }
  }

  const trend4h = tradingEngine.detectTrend(marketData["4h"])
  const trend1h = tradingEngine.detectTrend(marketData["1h"])
  const trend15m = tradingEngine.detectTrend(marketData["15m"])
  const trend5m = tradingEngine.detectTrend(marketData["5m"])

  console.log("[v0] CRON TIER CALC - Trends:", { trend4h, trend1h, trend15m, trend5m })
  console.log("[v0] CRON TIER CALC - Scores:", {
    "4h": `${score4h.score}/${score4h.maxScore}`,
    "1h": `${score1h.score}/${score1h.maxScore}`,
    "15m": `${score15m.score}/${score15m.maxScore}`,
    "5m": `${score5m.score}/${score5m.maxScore}`,
  })

  const conservativeMode = trend4h === trend1h && trend4h !== "ranging"
  const aggressiveMode = trend1h === trend15m && trend1h === trend5m && trend1h !== "ranging"

  console.log("[v0] CRON TIER CALC - Mode checks:", { conservativeMode, aggressiveMode })

  const strongTimeframes = [score4h.score >= 3, score1h.score >= 2, score15m.score >= 2, score5m.score >= 2].filter(
    Boolean,
  ).length

  console.log("[v0] CRON TIER CALC - Strong timeframes:", strongTimeframes)

  // Tier 1: At least 2 strong timeframes
  if (strongTimeframes >= 2) {
    console.log("[v0] CRON TIER CALC - Tier 1 met (2+ strong timeframes)")

    // Tier 2: Partial alignment forming
    const partialAlignment =
      (trend1h === trend15m && trend1h !== "ranging") ||
      (trend15m === trend5m && trend15m !== "ranging") ||
      (trend4h === trend1h && trend4h !== "ranging")

    console.log("[v0] CRON TIER CALC - Partial alignment:", partialAlignment)
    console.log("[v0] CRON TIER CALC - Alignment pairs:", {
      "1h-15m": trend1h === trend15m && trend1h !== "ranging",
      "15m-5m": trend15m === trend5m && trend15m !== "ranging",
      "4h-1h": trend4h === trend1h && trend4h !== "ranging",
    })

    if (partialAlignment && strongTimeframes >= 2) {
      console.log("[v0] CRON TIER CALC - Tier 2 met (partial alignment + strong timeframes)")

      // Tier 3-4: Full alignment check
      if (aggressiveMode || conservativeMode) {
        let fullTier = 0
        if (score4h.score >= 3) fullTier++
        if (score1h.score >= 2) fullTier++
        if (score15m.score >= 1) fullTier++
        if (score5m.score >= 1) fullTier++

        const mode = conservativeMode ? "conservative" : "aggressive"
        console.log("[v0] CRON TIER CALC - Full alignment achieved!")
        console.log("[v0] CRON TIER CALC - Mode:", mode)
        console.log("[v0] CRON TIER CALC - Full tier:", fullTier >= 4 ? 4 : Math.max(3, fullTier))

        return {
          tier: fullTier >= 4 ? 4 : Math.max(3, fullTier),
          mode,
          debugInfo: { strongTimeframes, partialAlignment: true, fullAlignment: true },
        }
      }

      console.log("[v0] CRON TIER CALC - Returning tier 2 (no full alignment yet)")
      return {
        tier: 2,
        mode: "partial",
        debugInfo: { strongTimeframes, partialAlignment: true, fullAlignment: false },
      }
    }

    console.log("[v0] CRON TIER CALC - Returning tier 1 (no partial alignment yet)")
    return {
      tier: 1,
      mode: "building",
      debugInfo: { strongTimeframes, partialAlignment: false, fullAlignment: false },
    }
  }

  console.log("[v0] CRON TIER CALC - Returning tier 0 (not enough strong timeframes)")
  return {
    tier: 0,
    mode: "none",
    debugInfo: { strongTimeframes, partialAlignment: false, fullAlignment: false },
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  console.log("[v0] ==============================================")
  console.log("[v0] 🤖 CRON JOB STARTING - Market Scan Initiated")
  console.log("[v0] ==============================================")
  console.log("[v0] Timestamp:", new Date().toISOString())

  console.log("[v0] Secret from URL:", secret ? `${secret.substring(0, 5)}...` : "MISSING")
  console.log(
    "[v0] Expected secret:",
    process.env.CRON_SECRET ? `${process.env.CRON_SECRET.substring(0, 5)}...` : "NOT SET",
  )
  console.log("[v0] Secrets match:", secret === process.env.CRON_SECRET)
  console.log("[v0] ==============================================")

  if (secret !== process.env.CRON_SECRET) {
    console.log("[v0] ❌ UNAUTHORIZED - Secret mismatch!")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("[v0] ==============================================")
    console.log("[v0] === CRON JOB STARTED ===")
    console.log("[v0] Timestamp:", new Date().toISOString())
    console.log("[v0] ==============================================")

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

    const tierResult = calculateAlertTier(timeframeScores, marketData)
    const currentTier = tierResult.tier
    const currentMode = tierResult.mode

    console.log("[v0] ==============================================")
    console.log("[v0] TIER CALCULATION RESULT:")
    console.log("[v0] Current tier:", currentTier)
    console.log("[v0] Current mode:", currentMode)
    console.log("[v0] Last alert tier:", lastAlertTier)
    console.log("[v0] Debug info:", JSON.stringify(tierResult.debugInfo, null, 2))
    console.log("[v0] ==============================================")

    console.log("[v0] Scores:", timeframeScores.map((s) => `${s.timeframe}: ${s.score}/${s.maxScore}`).join(", "))

    const shouldSendAlert = marketStatus.isOpen && currentTier > lastAlertTier && currentTier >= 1

    console.log("[v0] ==============================================")
    console.log("[v0] ALERT CHECK:")
    console.log("[v0] Market open:", marketStatus.isOpen)
    console.log("[v0] Current tier > last tier:", currentTier > lastAlertTier, `(${currentTier} > ${lastAlertTier})`)
    console.log("[v0] Current tier >= 1:", currentTier >= 1)
    console.log("[v0] Should send alert:", shouldSendAlert)
    console.log("[v0] ==============================================")

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

    if (shouldSendAlert) {
      console.log("[v0] ✅ ALERT CONDITIONS MET! Preparing to send alert...")
      console.log("[v0] Alert tier:", currentTier)

      try {
        if (currentTier === 1) {
          console.log("[v0] 📊 Sending TIER 1 alert (Building momentum)...")
          await sendTelegramAlert({
            type: "status",
            message: `🔍 Setup Building (1/4)\n\n${tierResult.debugInfo.strongTimeframes} timeframes showing strength.\n\nMonitor for alignment...`,
          })
          console.log("[v0] ✅ TIER 1 alert sent successfully")
        } else if (currentTier === 2) {
          console.log("[v0] ⚡ Sending TIER 2 alert (Get Ready)...")
          const trend4h = tradingEngine.detectTrend(marketData["4h"])
          const trend1h = tradingEngine.detectTrend(marketData["1h"])
          const trend15m = tradingEngine.detectTrend(marketData["15m"])
          const trend5m = tradingEngine.detectTrend(marketData["5m"])

          // Determine dominant direction (majority vote)
          const bullishCount = [trend4h, trend1h, trend15m, trend5m].filter((t) => t === "bullish").length
          const bearishCount = [trend4h, trend1h, trend15m, trend5m].filter((t) => t === "bearish").length
          const dominantDirection =
            bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "ranging"

          console.log("[v0] Trend direction for alert:", dominantDirection)

          await sendTelegramAlert({
            type: "get_ready",
            timeframeScores,
            price: currentPrice,
            trend: dominantDirection,
          })
          console.log("[v0] ✅ TIER 2 alert sent successfully")
        } else if (currentTier === 3) {
          console.log("[v0] 📋 Sending TIER 3 alert (Limit Order)...")
          console.log("[v0] Current price:", currentPrice)
          const trend4h = tradingEngine.detectTrend(marketData["4h"])
          const trend1h = tradingEngine.detectTrend(marketData["1h"])
          const trend15m = tradingEngine.detectTrend(marketData["15m"])
          const trend5m = tradingEngine.detectTrend(marketData["5m"])
          console.log("[v0] Market trends - 4H:", trend4h, "1H:", trend1h, "15M:", trend15m, "5M:", trend5m)

          const signal = await tradingEngine.generateSignal(marketData, currentPrice)
          if (signal) {
            console.log("[v0] ✅ Signal generated for TIER 3")
            console.log("[v0]   Direction:", signal.direction)
            console.log("[v0]   Entry:", signal.entryPrice)
            console.log("[v0]   Stop Loss:", signal.stopLoss)
            console.log("[v0]   TP1:", signal.tp1)
            console.log("[v0]   TP2:", signal.tp2)

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

            let signalConfidence = calculateSignalConfidence(signal, marketContext, enhancedTimeframeScores)

            // Adjust confidence for aggressive mode (reduce by 2 points)
            if (currentMode === "aggressive") {
              signalConfidence = {
                ...signalConfidence,
                score: Math.max(5, signalConfidence.score - 2),
                recommendation: signalConfidence.score >= 7 ? "take" : "consider",
              }
            }

            console.log(
              "[v0] Signal confidence:",
              signalConfidence.score,
              "- Recommendation:",
              signalConfidence.recommendation,
              "- Mode:",
              currentMode,
            )

            await sendTelegramAlert({
              type: "limit_order",
              signal,
              confidence: signalConfidence,
            })
            console.log("[v0] ✅ TIER 3 Telegram alert sent successfully")
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
            console.log("[v0] ⚠️ No signal generated for tier 3 alert - signal generation returned null")
            console.log("[v0] Possible reasons: session filter, risk management, or breakout not detected")
          }
        } else if (currentTier === 4) {
          console.log("[v0] 🚀 Sending TIER 4 alert (ENTER NOW)...")
          console.log("[v0] Current price:", currentPrice)
          const trend4h = tradingEngine.detectTrend(marketData["4h"])
          const trend1h = tradingEngine.detectTrend(marketData["1h"])
          const trend15m = tradingEngine.detectTrend(marketData["15m"])
          const trend5m = tradingEngine.detectTrend(marketData["5m"])
          console.log("[v0] Market trends - 4H:", trend4h, "1H:", trend1h, "15M:", trend15m, "5M:", trend5m)

          const signal = await tradingEngine.generateSignal(marketData, currentPrice)
          if (signal) {
            console.log("[v0] ✅ Signal generated for TIER 4")
            console.log("[v0]   Direction:", signal.direction)
            console.log("[v0]   Entry:", signal.entryPrice)
            console.log("[v0]   Stop Loss:", signal.stopLoss)
            console.log("[v0]   TP1:", signal.tp1)
            console.log("[v0]   TP2:", signal.tp2)

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

            let signalConfidence = calculateSignalConfidence(signal, marketContext, enhancedTimeframeScores)

            // Adjust confidence for aggressive mode (reduce by 2 points)
            if (currentMode === "aggressive") {
              signalConfidence = {
                ...signalConfidence,
                score: Math.max(5, signalConfidence.score - 2),
                recommendation: signalConfidence.score >= 7 ? "take" : "consider",
              }
            }

            console.log(
              "[v0] Signal confidence:",
              signalConfidence.score,
              "- Recommendation:",
              signalConfidence.recommendation,
              "- Mode:",
              currentMode,
            )

            await sendTelegramAlert({
              type: "entry",
              signal,
              confidence: signalConfidence,
            })
            console.log("[v0] ✅ TIER 4 Telegram alert sent successfully")
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
            console.log("[v0] ⚠️ No signal generated for tier 4 alert - signal generation returned null")
            console.log("[v0] Possible reasons: session filter, risk management, or breakout not detected")
          }
        }

        lastAlertTier = currentTier
        console.log("[v0] 📝 Alert tier updated to:", lastAlertTier)
      } catch (telegramError) {
        console.error("[v0] ❌ Error sending Telegram alert:", telegramError)
        return NextResponse.json(
          {
            success: false,
            error: `Telegram error: ${telegramError instanceof Error ? telegramError.message : "Unknown"}`,
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        )
      }
    } else {
      console.log("[v0] ❌ NO ALERT SENT - Conditions not met:")
      if (!marketStatus.isOpen) console.log("[v0]   - Market is CLOSED")
      if (currentTier <= lastAlertTier) console.log("[v0]   - Tier not increased:", currentTier, "<=", lastAlertTier)
      if (currentTier < 1) console.log("[v0]   - Tier below threshold (< 1)")
    }

    // Reset if tier drops back to 0 or 1
    if (currentTier <= 1) {
      console.log("[v0] Tier dropped to", currentTier, "- resetting lastAlertTier")
      lastAlertTier = 0
    }

    console.log("[v0] ==============================================")
    console.log("[v0] 🤖 CRON JOB COMPLETED")
    console.log("[v0] ==============================================")

    return NextResponse.json({
      success: true,
      currentTier,
      currentMode,
      lastAlertTier,
      tierDebugInfo: tierResult.debugInfo,
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
