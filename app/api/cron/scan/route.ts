// Cron job API route - runs every 5 minutes with tiered alerts

import { type NextRequest, NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { tradingEngine } from "@/lib/strategy/engine"
import type { Timeframe } from "@/lib/types/trading"
import { sendTelegramAlert } from "@/lib/telegram/client"
import { getGoldMarketStatus } from "@/lib/utils/market-hours"
import { getMarketContext, shouldAvoidTrading } from "@/lib/market-context/intelligence"
import { tradeHistoryManager } from "@/lib/database/trade-history"
import { calculateConfirmationTier } from "@/lib/strategy/tier-calculator"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Store last alert tier to avoid duplicate alerts
let lastAlertTier = 0
let lastActiveSignal: any | null = null

export async function GET(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] 🤖 CRON JOB HIT - Request received")
  console.log("[v0] Timestamp:", new Date().toISOString())
  console.log("[v0] URL:", request.url)
  console.log("[v0] Method:", request.method)
  console.log("[v0] ========================================")

  try {
    const authHeader = request.headers.get("authorization")
    const urlSecret = request.nextUrl.searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    console.log("[v0] 🔐 AUTHENTICATION CHECK")
    console.log("[v0] Auth header present:", !!authHeader)
    console.log("[v0] URL secret present:", !!urlSecret)
    console.log("[v0] CRON_SECRET configured:", !!cronSecret)

    if (urlSecret) {
      console.log("[v0] URL secret value:", urlSecret)
    }
    if (cronSecret) {
      console.log("[v0] Expected CRON_SECRET:", cronSecret)
      console.log("[v0] ⚠️  UPDATE YOUR CRON-JOB.ORG URL TO:")
      console.log("[v0] ⚠️  https://switchcx.vercel.app/api/cron/scan?secret=" + cronSecret)
    }

    if (!cronSecret) {
      console.error("[v0] ❌ ERROR: CRON_SECRET not configured in Vercel")
      return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 })
    }

    const providedSecret = authHeader?.replace("Bearer ", "") || urlSecret

    if (!providedSecret || providedSecret !== cronSecret) {
      console.error("[v0] ❌ AUTHENTICATION FAILED")
      console.error("[v0] Expected secret (first 10 chars):", cronSecret.substring(0, 10) + "...")
      console.error(
        "[v0] Received secret (first 10 chars):",
        providedSecret ? providedSecret.substring(0, 10) + "..." : "none",
      )
      console.error("[v0] ⚠️  UPDATE YOUR CRON-JOB.ORG URL TO:")
      console.error("[v0] ⚠️  https://switchcx.vercel.app/api/cron/scan?secret=" + cronSecret)

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          hint: "Update cron-job.org URL with ?secret=YOUR_CRON_SECRET from Vercel env vars",
          expectedSecretPreview: cronSecret.substring(0, 10) + "...",
          receivedSecretPreview: providedSecret ? providedSecret.substring(0, 10) + "..." : "none",
        },
        { status: 401 },
      )
    }

    console.log("[v0] ✅ Authentication successful!")

    console.log("[v0] ==============================================")
    console.log("[v0] 🤖 CRON JOB STARTING - Market Scan Initiated")
    console.log("[v0] ==============================================")
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

    const trend4h = tradingEngine.detectTrend(marketData["4h"])
    const trend1h = tradingEngine.detectTrend(marketData["1h"])
    const trend15m = tradingEngine.detectTrend(marketData["15m"])
    const trend5m = tradingEngine.detectTrend(marketData["5m"])

    console.log("[v0] CRON - Detected trends:", { trend4h, trend1h, trend15m, trend5m })

    const tierResult = calculateConfirmationTier(timeframeScores, trend4h, trend1h, trend15m, trend5m)
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

    const shouldSendAlert = marketStatus.isOpen && currentTier >= 3

    console.log("[v0] ==============================================")
    console.log("[v0] ALERT CHECK:")
    console.log("[v0] Market open:", marketStatus.isOpen)
    console.log("[v0] Current tier >= 3:", currentTier >= 3)
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
      console.log("[v0] ======================================")
      console.log("[v0] ALERT CONDITIONS MET!")
      console.log("[v0] Current tier:", currentTier)
      console.log("[v0] Last alert tier:", lastAlertTier)
      console.log("[v0] ======================================")

      try {
        if (currentTier === 3 && lastAlertTier < 3) {
          console.log("[v0] 📊 Sending TIER 3 alert...")

          const setupDirection = tierResult.debugInfo.conservativeMode ? trend4h : trend1h
          const modeLabel = currentMode === "conservative" ? "Conservative (4H+1H)" : "Aggressive (1H+15M+5M)"

          if (currentMode === "aggressive") {
            console.log("[v0] ⚡ TIER 3 AGGRESSIVE - Generating limit order signal")

            const signal = await tradingEngine.generateSignal(marketData, currentPrice, true)

            if (signal) {
              console.log("[v0] ✅ Signal generated for tier 3 aggressive")
              console.log("[v0] Signal direction:", signal.direction)
              console.log("[v0] Entry:", signal.entryPrice, "Stop:", signal.stopLoss)

              const lastSignalDirection = lastActiveSignal?.direction || null

              if (lastSignalDirection && lastSignalDirection !== signal.direction) {
                console.log("[v0] 🔄 DIRECTION CHANGE DETECTED!")
                console.log("[v0] Previous:", lastSignalDirection, "→ New:", signal.direction)

                await sendTelegramAlert({
                  type: "status",
                  message: `🔄 *DIRECTION CHANGE ALERT!*\n\nMarket has shifted from ${lastSignalDirection.toUpperCase()} to ${signal.direction.toUpperCase()}\n\nPrevious trade may be invalidated. Review your position!`,
                })
              }

              const signalConfidence = {
                score: Math.max(5, 8 - 2),
                recommendation: "consider" as const,
                factors: {
                  timeframeAlignment: 0.8,
                  trendStrength: 0.7,
                  volatility: 0.7,
                  sessionTiming: 0.8,
                  marketContext: 0.8,
                },
              }

              await sendTelegramAlert({
                type: "limit_order",
                signal,
                confidence: signalConfidence,
                timeframeScores,
                price: currentPrice,
              })

              console.log("[v0] ✅ Tier 3 aggressive limit order alert sent successfully")
              lastActiveSignal = signal
              lastAlertTier = 3
            } else {
              console.log("[v0] ⚠️ Signal generation returned null for tier 3 aggressive")

              await sendTelegramAlert({
                type: "status",
                message: `🔍 *Setup Building* (Tier 3 - Aggressive)\n\nMode: ${modeLabel}\nDirection: ${setupDirection.toUpperCase()}\n\n${tierResult.debugInfo.strongTimeframes} timeframes showing strength.\n\nMonitor for entry opportunity...`,
              })
              lastAlertTier = 3
            }
          } else {
            // Conservative mode tier 3: Just notify about setup building
            await sendTelegramAlert({
              type: "status",
              message: `🔍 *Setup Building* (Tier 3)\n\nMode: ${modeLabel}\nDirection: ${setupDirection.toUpperCase()}\n\n${tierResult.debugInfo.strongTimeframes} timeframes showing strength.\n\nMonitor for full alignment...`,
            })
            console.log("[v0] ✅ TIER 3 conservative alert sent successfully")
            lastAlertTier = 3
          }
        } else if (currentTier === 4) {
          console.log("[v0] ⚡ TIER 4 - Full alignment detected")

          const bullishCount = [trend4h, trend1h, trend15m, trend5m].filter((t) => t === "bullish").length
          const bearishCount = [trend4h, trend1h, trend15m, trend5m].filter((t) => t === "bearish").length
          const dominantDirection =
            bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "ranging"

          console.log("[v0] Dominant direction:", dominantDirection)

          const signal = await tradingEngine.generateSignal(marketData, currentPrice, currentMode === "aggressive")

          if (signal) {
            console.log("[v0] ✅ Signal generated for tier 4")
            console.log("[v0] Signal direction:", signal.direction)
            console.log("[v0] Entry:", signal.entryPrice, "Stop:", signal.stopLoss)

            const lastSignalDirection = lastActiveSignal?.direction || null

            if (lastSignalDirection && lastSignalDirection !== signal.direction) {
              console.log("[v0] 🔄 DIRECTION CHANGE DETECTED!")
              console.log("[v0] Previous:", lastSignalDirection, "→ New:", signal.direction)

              await sendTelegramAlert({
                type: "status",
                message: `🔄 *DIRECTION CHANGE ALERT!*\n\nMarket has shifted from ${lastSignalDirection.toUpperCase()} to ${signal.direction.toUpperCase()}\n\nPrevious trade may be invalidated. Review your position!`,
              })
            }

            const signalConfidence = {
              score: 8,
              recommendation: "take" as const,
              factors: {
                timeframeAlignment: 0.9,
                trendStrength: 0.85,
                volatility: 0.8,
                sessionTiming: 0.85,
                marketContext: 0.85,
              },
            }

            await sendTelegramAlert({
              type: "limit_order",
              signal,
              confidence: signalConfidence,
              timeframeScores,
              price: currentPrice,
            })

            console.log("[v0] ✅ Limit order alert sent successfully")
            lastActiveSignal = signal
            lastAlertTier = 4
          } else {
            console.log("[v0] ⚠️ Signal generation returned null")
            console.log("[v0] Sending generic get_ready alert instead")

            await sendTelegramAlert({
              type: "get_ready",
              timeframeScores,
              price: currentPrice,
              trend: dominantDirection,
            })
            lastAlertTier = 4
          }
        }
      } catch (telegramError) {
        console.error("[v0] ❌ Telegram alert error:", telegramError)
        console.error(
          "[v0] Error details:",
          telegramError instanceof Error ? telegramError.message : String(telegramError),
        )
      }
    } else {
      console.log("[v0] ❌ Alert conditions NOT met")
      console.log("[v0] Market open:", marketStatus.isOpen, "| Tier:", currentTier, "| Required: 3+")
    }

    if (currentTier < 3 && lastAlertTier >= 3) {
      console.log("[v0] ⬇️ Tier dropped below 3 - resetting lastAlertTier")
      lastAlertTier = 0
    }

    console.log("[v0] ========================================")
    console.log("[v0] CRON JOB COMPLETED SUCCESSFULLY")
    console.log("[v0] Final state - Tier:", currentTier, "| Last alert:", lastAlertTier)
    console.log("[v0] ========================================")

    return NextResponse.json({
      success: true,
      currentTier,
      currentMode,
      lastAlertTier,
      hasActiveSignal: !!lastActiveSignal,
      activeSignalDirection: lastActiveSignal?.direction || null,
      tierDebugInfo: tierResult.debugInfo,
      timeframeScores: timeframeScores.map((s) => ({
        timeframe: s.timeframe,
        score: s.score,
        maxScore: s.maxScore,
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] ========================================")
    console.error("[v0] CRON JOB FAILED WITH ERROR")
    console.error("[v0] Error:", error)
    console.error("[v0] Stack:", error instanceof Error ? error.stack : "No stack trace")
    console.error("[v0] ========================================")

    await sendTelegramAlert({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    })

    console.error("[v0] ========== CRON JOB FAILED ==========")
    console.error("[v0] Error:", error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")

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
