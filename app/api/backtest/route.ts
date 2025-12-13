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

    const timeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
    let marketData

    try {
      marketData = await twelveDataClient.fetchMultipleTimeframes(timeframes)
    } catch (fetchError) {
      console.error("[v0] Failed to fetch market data:", fetchError)

      // Check if it's a rate limit error
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)
      if (errorMessage.includes("429") || errorMessage.includes("rate limit") || errorMessage.includes("credits")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "API rate limit exceeded. Please wait a minute and try again, or add a third API key to increase your rate limit.",
            errorType: "rate_limit",
          },
          { status: 429 },
        )
      }

      throw fetchError
    }

    const requiredTimeframes: Timeframe[] = ["4h", "1h", "15m", "5m"]
    for (const tf of requiredTimeframes) {
      if (!marketData[tf] || !Array.isArray(marketData[tf]) || marketData[tf].length === 0) {
        console.error(`[v0] Missing or empty data for ${tf}`)
        return NextResponse.json(
          {
            success: false,
            error: `Missing market data for ${tf} timeframe. This might be due to API rate limits or connectivity issues.`,
            errorType: "missing_data",
          },
          { status: 500 },
        )
      }
    }

    console.log("[v0] ✅ All market data validated successfully")
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
              ? "Conservative (20/50 EMA)" // Updated from 50/200 to 20/50 EMA
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
        errorType: "unknown",
      },
      { status: 500 },
    )
  }
}
