import { NextResponse } from "next/server"
import { twelveDataAPI } from "@/lib/api/twelve-data"
import { calculateEMA, calculateMACD, calculateStochRSI } from "@/lib/strategy/indicators"

export async function GET() {
  try {
    console.log("[v0] Starting diagnostics...")

    const symbol = "XAUUSD"
    const timeframes = ["4h", "1h", "15min", "5min"] as const

    const analysis: any = {
      timestamp: new Date().toISOString(),
      timeframes: {},
    }

    // Fetch and analyze each timeframe
    for (const tf of timeframes) {
      console.log(`[v0] Fetching ${tf} data...`)
      const data = await twelveDataAPI.getTimeSeriesData(symbol, tf, 200)

      if (!data || data.length < 50) {
        analysis.timeframes[tf] = { error: "Insufficient data" }
        continue
      }

      const closes = data.map((c) => c.close)
      const ema8 = calculateEMA(closes, 8)
      const ema21 = calculateEMA(closes, 21)
      const ema50 = calculateEMA(closes, 50)
      const ema200 = calculateEMA(closes, 200)
      const macd = calculateMACD(closes)
      const stochRSI = calculateStochRSI(closes)

      const lastIdx = closes.length - 1
      const currentPrice = closes[lastIdx]

      // Determine trends
      const trend8_21 = ema8[lastIdx] > ema21[lastIdx] ? "bullish" : "bearish"
      const trend50_200 = ema50[lastIdx] > ema200[lastIdx] ? "bullish" : "bearish"

      // Check last 10 candles for momentum
      const last10Candles = data.slice(-10)
      const bullishCandles = last10Candles.filter((c, i) => i > 0 && c.close > last10Candles[i - 1].close).length

      analysis.timeframes[tf] = {
        price: currentPrice.toFixed(2),
        ema8: ema8[lastIdx]?.toFixed(2),
        ema21: ema21[lastIdx]?.toFixed(2),
        ema50: ema50[lastIdx]?.toFixed(2),
        ema200: ema200[lastIdx]?.toFixed(2),
        trend_8_21: trend8_21,
        trend_50_200: trend50_200,
        ema8_above_21: ema8[lastIdx] > ema21[lastIdx],
        ema50_above_200: ema50[lastIdx] > ema200[lastIdx],
        macd_value: macd.macd[lastIdx]?.toFixed(4),
        macd_signal: macd.signal[lastIdx]?.toFixed(4),
        macd_histogram: macd.histogram[lastIdx]?.toFixed(4),
        macd_bullish: macd.macd[lastIdx] > macd.signal[lastIdx],
        stochRSI_k: stochRSI.k[lastIdx]?.toFixed(2),
        stochRSI_d: stochRSI.d[lastIdx]?.toFixed(2),
        bullish_candles_last_10: bullishCandles,
        total_candles: data.length,
      }
    }

    // Conservative mode check
    const tf4h = analysis.timeframes["4h"]
    const tf1h = analysis.timeframes["1h"]
    analysis.conservative_aligned = tf4h?.trend_50_200 === tf1h?.trend_50_200 && tf4h?.trend_50_200 !== undefined

    // Aggressive mode check
    const tf15m = analysis.timeframes["15min"]
    const tf5m = analysis.timeframes["5min"]
    analysis.aggressive_aligned =
      tf1h?.trend_8_21 === tf15m?.trend_8_21 && tf15m?.trend_8_21 === tf5m?.trend_8_21 && tf1h?.trend_8_21 !== undefined

    console.log("[v0] Diagnostics complete:", JSON.stringify(analysis, null, 2))

    return NextResponse.json({ success: true, data: analysis })
  } catch (error: any) {
    console.error("[v0] Diagnostics error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
