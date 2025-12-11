import { NextResponse } from "next/server"
import { twelveDataClient } from "@/lib/api/twelve-data"
import { backtestAnalyzer } from "@/lib/strategy/backtest-analyzer"
import type { Timeframe } from "@/lib/types/trading"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try {
    console.log("[v0] Starting backtest analysis...")

    console.log("[v0] Current time:", new Date().toISOString())

    // Fetch historical data
    const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
    const marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)

    console.log(
      "[v0] Data fetched. Latest 1H candle:",
      new Date(marketData["1h"][marketData["1h"].length - 1].timestamp).toISOString(),
    )

    // Run both backtests
    const conservativeResults = await backtestAnalyzer.runBacktest(marketData, "conservative")
    const aggressiveResults = await backtestAnalyzer.runBacktest(marketData, "aggressive")

    // Determine which is better
    const conservativeScore = conservativeResults.winRate * conservativeResults.avgRMultiple
    const aggressiveScore = aggressiveResults.winRate * aggressiveResults.avgRMultiple

    const recommendation =
      conservativeScore > aggressiveScore
        ? "conservative"
        : aggressiveScore > conservativeScore
          ? "aggressive"
          : "both_equal"

    return NextResponse.json({
      success: true,
      data: {
        conservative: conservativeResults,
        aggressive: aggressiveResults,
        recommendation,
        analysis: {
          conservativeScore: conservativeScore.toFixed(2),
          aggressiveScore: aggressiveScore.toFixed(2),
          winner:
            recommendation === "conservative"
              ? "Conservative (50/200 EMA)"
              : recommendation === "aggressive"
                ? "Aggressive (8/21 EMA)"
                : "Both strategies perform equally",
        },
      },
    })
  } catch (error) {
    console.error("[v0] Backtest error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Backtest failed",
      },
      { status: 500 },
    )
  }
}
