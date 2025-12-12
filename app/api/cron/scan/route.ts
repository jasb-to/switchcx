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
import { signalStore } from "@/lib/cache/signal-store"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Store last alert tier to avoid duplicate alerts
let lastAlertTier = 0
let lastEmergencyExitTimestamp = 0
const EMERGENCY_EXIT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes cooldown after emergency exit

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] ========================")
    console.log("[v0] CRON JOB HIT")
    console.log("[v0] Timestamp:", new Date().toISOString())
    console.log("[v0] ========================")

    try {
      // Verify authentication
      const authHeader = request.headers.get("authorization")
      const { searchParams } = new URL(request.url)
      const urlSecret = searchParams.get("secret")

      const expectedSecret = process.env.CRON_SECRET

      console.log("[v0] Auth check:")
      console.log("[v0] - Has Authorization header:", !!authHeader)
      console.log("[v0] - URL secret provided:", !!urlSecret)
      console.log("[v0] - Expected CRON_SECRET:", expectedSecret ? "SET" : "NOT SET")

      if (expectedSecret) {
        const isValidHeader = authHeader === `Bearer ${expectedSecret}`
        const isValidUrlParam = urlSecret === expectedSecret

        if (!isValidHeader && !isValidUrlParam) {
          console.error("[v0] ❌ Authentication failed")
          console.log(
            "[v0] UPDATE YOUR CRON-JOB.ORG URL TO: https://switchcx.vercel.app/api/cron/scan?secret=" + expectedSecret,
          )
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        console.log("[v0] ✅ Authentication successful")
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Cron execution timeout after 50 seconds")), 50000),
      )

      const executionPromise = (async () => {
        // Check for active signal
        const activeSignal = signalStore.getActiveSignal()

        if (activeSignal) {
          console.log("[v0] Active signal exists:", activeSignal.id)
          console.log("[v0] Signal direction:", activeSignal.direction)
          console.log("[v0] Checking for direction changes...")

          // Direction change detection logic
          try {
            const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
            const marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)
            const currentPrice = await twelveDataClient.getLatestPrice()

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

            const trend4h = tradingEngine.detectTrend(marketData["4h"])
            const trend1h = tradingEngine.detectTrend(marketData["1h"])
            const trend15m = tradingEngine.detectTrend(marketData["15m"])
            const trend5m = tradingEngine.detectTrend(marketData["5m"])

            console.log("[v0] CRON - Detected trends:", { trend4h, trend1h, trend15m, trend5m })

            const storedDirection = signalStore.getActiveSignalDirection()

            console.log("[v0] 🔍 DIRECTION CHECK:")
            console.log("[v0] Stored active signal:", activeSignal ? "YES" : "NO")
            console.log("[v0] Stored direction:", storedDirection)
            console.log("[v0] Current trends - 4H:", trend4h, "1H:", trend1h, "15M:", trend15m, "5M:", trend5m)

            const timeSinceEmergencyExit = Date.now() - lastEmergencyExitTimestamp
            const inEmergencyCooldown =
              timeSinceEmergencyExit > 0 && timeSinceEmergencyExit < EMERGENCY_EXIT_COOLDOWN_MS

            if (inEmergencyCooldown) {
              const remainingMinutes = Math.ceil((EMERGENCY_EXIT_COOLDOWN_MS - timeSinceEmergencyExit) / (60 * 1000))
              console.log("[v0] ⏸️  In emergency exit cooldown -", remainingMinutes, "minutes remaining")
            }

            let reversalReason = ""

            const riskAmount = Math.abs(activeSignal.entryPrice - activeSignal.stopLoss)
            const currentRisk =
              activeSignal.direction === "bullish"
                ? activeSignal.entryPrice - currentPrice
                : currentPrice - activeSignal.entryPrice

            const riskPercentage = (currentRisk / riskAmount) * 100

            const priceNearStop = riskPercentage >= 70
            const priceHitStop =
              (activeSignal.direction === "bullish" && currentPrice <= activeSignal.stopLoss) ||
              (activeSignal.direction === "bearish" && currentPrice >= activeSignal.stopLoss)

            const trend4hReversed =
              (activeSignal.direction === "bullish" && trend4h === "bearish") ||
              (activeSignal.direction === "bearish" && trend4h === "bullish")

            const trend1hReversed =
              (activeSignal.direction === "bullish" && trend1h === "bearish") ||
              (activeSignal.direction === "bearish" && trend1h === "bullish")

            const bothPrimaryTimeframesReversed = trend4hReversed && trend1hReversed

            // Alert only if BOTH 4H AND 1H reverse OR stop loss conditions met
            const shouldAlertReversal = priceHitStop || priceNearStop || bothPrimaryTimeframesReversed

            console.log("[v0] 🔍 REVERSAL CONDITIONS:")
            console.log("[v0] Price hit stop:", priceHitStop)
            console.log("[v0] Price near stop (70%+):", priceNearStop, "Risk %:", riskPercentage.toFixed(1))
            console.log(
              "[v0] 4H reversed:",
              trend4hReversed,
              "(Current:",
              trend4h,
              "vs Signal:",
              activeSignal.direction + ")",
            )
            console.log(
              "[v0] 1H reversed:",
              trend1hReversed,
              "(Current:",
              trend1h,
              "vs Signal:",
              activeSignal.direction + ")",
            )
            console.log("[v0] BOTH 4H + 1H reversed:", bothPrimaryTimeframesReversed)
            console.log("[v0] Should alert:", shouldAlertReversal)

            if (shouldAlertReversal) {
              console.log("[v0] ⚠️ REVERSAL DETECTED IN CRON!")

              if (marketStatus.isOpen) {
                if (priceHitStop) {
                  reversalReason = `🛑 STOP LOSS HIT! Current: $${currentPrice.toFixed(2)}, Stop: $${activeSignal.stopLoss.toFixed(2)}`
                } else if (priceNearStop) {
                  reversalReason = `⚠️ DANGER ZONE! Price is ${riskPercentage.toFixed(0)}% towards stop loss ($${activeSignal.stopLoss.toFixed(2)})`
                } else if (bothPrimaryTimeframesReversed) {
                  reversalReason = `🔴 MAJOR TREND REVERSAL! Both 4H and 1H now ${trend4h.toUpperCase()} (was ${activeSignal.direction})`
                }

                await sendTelegramAlert({
                  type: "reversal",
                  signal: activeSignal,
                  message: reversalReason,
                  price: currentPrice,
                })

                console.log("[v0] ✅ EMERGENCY EXIT alert sent from cron")

                lastEmergencyExitTimestamp = Date.now()
                console.log("[v0] 🚫 Emergency exit cooldown started - No new signals for 15 minutes")

                // Close trade in history
                const openTrades = tradeHistoryManager.getAllTrades().filter((t) => t.status === "open")
                if (openTrades.length > 0) {
                  const trade = openTrades[openTrades.length - 1]
                  const pnl =
                    activeSignal.direction === "bullish"
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

                signalStore.invalidateSignal()
                lastAlertTier = 0
              }

              return NextResponse.json({
                success: true,
                emergencyExit: true,
                reason: reversalReason,
                cooldownMinutes: 15,
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            console.error("[v0] Error checking direction changes:", error)
            // Continue execution even if this fails
          }
        }

        // Fetch multi-timeframe data
        const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
        const marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)
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

        const shouldSendAlert = marketStatus.isOpen && currentTier >= 3

        console.log("[v0] ==============================================")
        console.log("[v0] ALERT CHECK:")
        console.log("[v0] Market open:", marketStatus.isOpen)
        console.log("[v0] Current tier >= 3:", currentTier >= 3)
        console.log("[v0] Should send alert:", shouldSendAlert)
        console.log("[v0] ==============================================")

        const storedSignal = signalStore.getActiveSignal()
        const storedDirection = signalStore.getActiveSignalDirection()

        console.log("[v0] 🔍 DIRECTION CHECK:")
        console.log("[v0] Stored active signal:", storedSignal ? "YES" : "NO")
        console.log("[v0] Stored direction:", storedDirection)
        console.log("[v0] Current trends - 4H:", trend4h, "1H:", trend1h, "15M:", trend15m, "5M:", trend5m)

        const timeSinceEmergencyExit = Date.now() - lastEmergencyExitTimestamp
        const inEmergencyCooldown = timeSinceEmergencyExit > 0 && timeSinceEmergencyExit < EMERGENCY_EXIT_COOLDOWN_MS

        if (inEmergencyCooldown) {
          const remainingMinutes = Math.ceil((EMERGENCY_EXIT_COOLDOWN_MS - timeSinceEmergencyExit) / (60 * 1000))
          console.log("[v0] ⏸️  In emergency exit cooldown -", remainingMinutes, "minutes remaining")
        }

        let reversalReason = ""

        if (storedSignal) {
          const riskAmount = Math.abs(storedSignal.entryPrice - storedSignal.stopLoss)
          const currentRisk =
            storedSignal.direction === "bullish"
              ? storedSignal.entryPrice - currentPrice
              : currentPrice - storedSignal.entryPrice

          const riskPercentage = (currentRisk / riskAmount) * 100

          const priceNearStop = riskPercentage >= 70
          const priceHitStop =
            (storedSignal.direction === "bullish" && currentPrice <= storedSignal.stopLoss) ||
            (storedSignal.direction === "bearish" && currentPrice >= storedSignal.stopLoss)

          const trend4hReversed =
            (storedSignal.direction === "bullish" && trend4h === "bearish") ||
            (storedSignal.direction === "bearish" && trend4h === "bullish")

          const trend1hReversed =
            (storedSignal.direction === "bullish" && trend1h === "bearish") ||
            (storedSignal.direction === "bearish" && trend1h === "bullish")

          const bothPrimaryTimeframesReversed = trend4hReversed && trend1hReversed

          // Alert only if BOTH 4H AND 1H reverse OR stop loss conditions met
          const shouldAlertReversal = priceHitStop || priceNearStop || bothPrimaryTimeframesReversed

          console.log("[v0] 🔍 REVERSAL CONDITIONS:")
          console.log("[v0] Price hit stop:", priceHitStop)
          console.log("[v0] Price near stop (70%+):", priceNearStop, "Risk %:", riskPercentage.toFixed(1))
          console.log(
            "[v0] 4H reversed:",
            trend4hReversed,
            "(Current:",
            trend4h,
            "vs Signal:",
            storedSignal.direction + ")",
          )
          console.log(
            "[v0] 1H reversed:",
            trend1hReversed,
            "(Current:",
            trend1h,
            "vs Signal:",
            storedSignal.direction + ")",
          )
          console.log("[v0] BOTH 4H + 1H reversed:", bothPrimaryTimeframesReversed)
          console.log("[v0] Should alert:", shouldAlertReversal)

          if (shouldAlertReversal) {
            console.log("[v0] ⚠️ REVERSAL DETECTED IN CRON!")

            if (marketStatus.isOpen) {
              if (priceHitStop) {
                reversalReason = `🛑 STOP LOSS HIT! Current: $${currentPrice.toFixed(2)}, Stop: $${storedSignal.stopLoss.toFixed(2)}`
              } else if (priceNearStop) {
                reversalReason = `⚠️ DANGER ZONE! Price is ${riskPercentage.toFixed(0)}% towards stop loss ($${storedSignal.stopLoss.toFixed(2)})`
              } else if (bothPrimaryTimeframesReversed) {
                reversalReason = `🔴 MAJOR TREND REVERSAL! Both 4H and 1H now ${trend4h.toUpperCase()} (was ${storedSignal.direction})`
              }

              await sendTelegramAlert({
                type: "reversal",
                signal: storedSignal,
                message: reversalReason,
                price: currentPrice,
              })

              console.log("[v0] ✅ EMERGENCY EXIT alert sent from cron")

              lastEmergencyExitTimestamp = Date.now()
              console.log("[v0] 🚫 Emergency exit cooldown started - No new signals for 15 minutes")

              // Close trade in history
              const openTrades = tradeHistoryManager.getAllTrades().filter((t) => t.status === "open")
              if (openTrades.length > 0) {
                const trade = openTrades[openTrades.length - 1]
                const pnl =
                  storedSignal.direction === "bullish"
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

              signalStore.invalidateSignal()
              lastAlertTier = 0
            }

            return NextResponse.json({
              success: true,
              emergencyExit: true,
              reason: reversalReason,
              cooldownMinutes: 15,
              timestamp: new Date().toISOString(),
            })
          }
        }

        if (inEmergencyCooldown && shouldSendAlert) {
          const remainingMinutes = Math.ceil((EMERGENCY_EXIT_COOLDOWN_MS - timeSinceEmergencyExit) / (60 * 1000))
          console.log(
            "[v0] 🚫 Skipping new signal generation - Emergency cooldown active for",
            remainingMinutes,
            "more minutes",
          )

          return NextResponse.json({
            success: true,
            blocked: true,
            reason: `Emergency exit cooldown active (${remainingMinutes} minutes remaining)`,
            timestamp: new Date().toISOString(),
          })
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

                  const lastSignalDirection = signalStore.getActiveSignalDirection()

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
                  signalStore.setActiveSignal(signal)
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

                const lastSignalDirection = signalStore.getActiveSignalDirection()

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
                signalStore.setActiveSignal(signal)
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
          hasActiveSignal: signalStore.hasActiveSignal(),
          activeSignalDirection: signalStore.getActiveSignalDirection(),
          tierDebugInfo: tierResult.debugInfo,
          timeframeScores: timeframeScores.map((s) => ({
            timeframe: s.timeframe,
            score: s.score,
            maxScore: s.maxScore,
          })),
          timestamp: new Date().toISOString(),
        })
      })()

      return (await Promise.race([executionPromise, timeoutPromise])) as Response
    } catch (error: any) {
      if (error.message?.includes("exhausted") || error.message?.includes("Daily limit")) {
        console.log("[v0] ⚠️ API limit reached, returning success to prevent cron failure notifications")
        return NextResponse.json({
          success: true,
          message: "API limit reached. Monitoring paused until midnight UTC.",
          timestamp: new Date().toISOString(),
        })
      }

      throw error
    }
  } catch (error: any) {
    console.error("[v0] ❌ Cron job error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
