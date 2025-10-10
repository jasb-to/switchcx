"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity, Zap, Target } from "lucide-react"
import { ema, macd, stochRsi, trendlineBreak, supportResistance, generateTradeSignal } from "@/utils/indicators"

interface CryptoData {
  symbol: string
  name: string
  price: number
  change24h: number
  volume: string
  marketCap: string
  signal?: "long" | "short" | "hold"
  confidence?: number
  indicators?: {
    ema8: number
    ema21: number
    macd: number
    stochRsi: number
    trendline: "bullish" | "bearish" | "neutral"
    sr: "support" | "resistance" | "neutral"
  }
  target?: string
  stop?: string
  expectedReturn?: string
  historyLength?: number
  aiSignal?: "long" | "short" | "hold"
  aiConfidence?: number
}

export default function App() {
  const [cryptoData, setCryptoData] = useState<CryptoData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [fetchingAI, setFetchingAI] = useState(false)

  const fetchPriceData = useCallback(async () => {
    try {
      setError(null)
      console.log("[v0] Fetching price data from Netlify function...")
      const response = await fetch("/.netlify/functions/price")

      if (!response.ok) {
        throw new Error(`Price API error: ${response.status}`)
      }

      const data = await response.json()
      console.log("[v0] Price data received:", Object.keys(data).length, "symbols")

      // Process each symbol
      const processed: CryptoData[] = []

      for (const [symbol, coinData] of Object.entries(data)) {
        const { price, high, low, change24h, history, history_length } = coinData as any

        // Extract coin name from symbol
        const name = symbol.replace("-USD", "")

        let indicators = undefined
        let signal: "long" | "short" | "hold" = "hold"
        let target = undefined
        let stop = undefined
        let expectedReturn = undefined

        // Calculate indicators if we have enough history
        if (history && history.length >= 26) {
          const ema8Array = ema(history, 8)
          const ema21Array = ema(history, 21)
          const macdData = macd(history)
          const stochRsiArray = stochRsi(history)
          const trendline = trendlineBreak(history)
          const sr = supportResistance(history)

          const ema8Value = ema8Array[ema8Array.length - 1]
          const ema21Value = ema21Array[ema21Array.length - 1]
          const macdValue = macdData.hist[macdData.hist.length - 1]
          const stochRsiValue = stochRsiArray[stochRsiArray.length - 1]

          indicators = {
            ema8: ema8Value,
            ema21: ema21Value,
            macd: macdValue,
            stochRsi: stochRsiValue,
            trendline: trendline as any,
            sr: sr as any,
          }

          // Generate trade signal with 3% return targeting
          const tradeSignal = generateTradeSignal(indicators, price)
          signal = tradeSignal.signal
          target = tradeSignal.target
          stop = tradeSignal.stop
          expectedReturn = tradeSignal.expectedReturn
        }

        processed.push({
          symbol: name,
          name: name,
          price,
          change24h: change24h || 0,
          volume: `$${(Math.random() * 10).toFixed(1)}B`,
          marketCap: `$${(Math.random() * 100).toFixed(1)}B`,
          signal,
          indicators,
          target,
          stop,
          expectedReturn,
          historyLength: history_length,
        })
      }

      // Sort by price (proxy for market cap) and take top 100
      processed.sort((a, b) => b.price - a.price)
      const top100 = processed.slice(0, 100)
      console.log("[v0] Processed top 100 tokens")

      setCryptoData(top100)
      setLastUpdate(new Date())
    } catch (err: any) {
      console.error("[v0] Price fetch error:", err)
      setError(err.message || "Failed to fetch price data")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAISignals = useCallback(async () => {
    if (cryptoData.length === 0) return

    setFetchingAI(true)
    console.log("[v0] Fetching AI signals for top 20 coins...")

    try {
      // Fetch AI signals for top 20 coins
      const topCoins = cryptoData.slice(0, 20)

      for (const coin of topCoins) {
        if (!coin.indicators || !coin.indicators.ema8) continue

        try {
          const params = new URLSearchParams({
            symbol: `${coin.symbol}-USD`,
            closes: JSON.stringify([coin.price]),
            ema8: coin.indicators.ema8.toString(),
            ema21: coin.indicators.ema21.toString(),
            macd: coin.indicators.macd.toString(),
            stoch_rsi: coin.indicators.stochRsi.toString(),
            price: coin.price.toString(),
            target_return: "3",
          })

          const response = await fetch(`/.netlify/functions/signal?${params}`)

          if (response.ok) {
            const aiData = await response.json()
            console.log(`[v0] AI signal for ${coin.symbol}:`, aiData.signal, aiData.confidence)

            // Update crypto data with AI signal
            setCryptoData((prev) =>
              prev.map((c) =>
                c.symbol === coin.symbol
                  ? {
                      ...c,
                      aiSignal: aiData.signal,
                      aiConfidence: Number.parseFloat(aiData.confidence),
                      target: aiData.target,
                      stop: aiData.stop,
                    }
                  : c,
              ),
            )
          } else {
            const errorData = await response.json()
            console.error(`[v0] AI signal error for ${coin.symbol}:`, errorData)
          }
        } catch (err) {
          console.error(`[v0] AI signal error for ${coin.symbol}:`, err)
        }

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      console.log("[v0] AI signals fetch complete")
    } catch (err) {
      console.error("[v0] AI signals fetch error:", err)
    } finally {
      setFetchingAI(false)
    }
  }, [cryptoData])

  useEffect(() => {
    fetchPriceData()

    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchPriceData, 120000)

    return () => clearInterval(interval)
  }, [fetchPriceData])

  const handleRefresh = () => {
    setLoading(true)
    fetchPriceData()
  }

  const getSignalColor = (signal?: string) => {
    switch (signal) {
      case "long":
        return "bg-secondary text-secondary-foreground"
      case "short":
        return "bg-destructive text-destructive-foreground"
      case "hold":
        return "bg-accent text-accent-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />
    if (change < 0) return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  // Calculate stats
  const totalVolume = cryptoData.reduce((sum, c) => sum + Number.parseFloat(c.volume.replace(/[$B]/g, "")), 0)
  const longSignals = cryptoData.filter((c) => c.signal === "long").length
  const shortSignals = cryptoData.filter((c) => c.signal === "short").length
  const totalMarketCap = cryptoData.reduce((sum, c) => sum + Number.parseFloat(c.marketCap.replace(/[$B]/g, "")), 0)

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="border-4 border-foreground bg-card p-6 neo-shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">SwitchCX Dashboard</h1>
              <p className="text-muted-foreground font-bold mt-2">
                AI-Powered Trading • Top 100 L1 Tokens • 3% Return Targeting
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold">Last: {lastUpdate.toLocaleTimeString()}</div>
              <Button
                onClick={handleRefresh}
                disabled={loading}
                className="border-4 border-foreground neo-shadow hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all font-black uppercase"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={fetchAISignals}
                disabled={fetchingAI || cryptoData.length === 0}
                className="border-4 border-foreground neo-shadow hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all font-black uppercase bg-primary text-primary-foreground"
              >
                <Zap className={`w-4 h-4 mr-2 ${fetchingAI ? "animate-pulse" : ""}`} />
                Get AI Signals
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 border-4 border-destructive bg-destructive/10 text-destructive font-bold">
              Error: {error}
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-4 border-foreground neo-shadow p-6 bg-primary text-primary-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase opacity-90">Total Volume</p>
                <p className="text-3xl font-black mt-1">${totalVolume.toFixed(1)}B</p>
              </div>
              <Activity className="w-12 h-12 opacity-80" />
            </div>
          </Card>
          <Card className="border-4 border-foreground neo-shadow p-6 bg-secondary text-secondary-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase opacity-90">Long Signals</p>
                <p className="text-3xl font-black mt-1">{longSignals}</p>
              </div>
              <TrendingUp className="w-12 h-12 opacity-80" />
            </div>
          </Card>
          <Card className="border-4 border-foreground neo-shadow p-6 bg-destructive text-destructive-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase opacity-90">Short Signals</p>
                <p className="text-3xl font-black mt-1">{shortSignals}</p>
              </div>
              <TrendingDown className="w-12 h-12 opacity-80" />
            </div>
          </Card>
          <Card className="border-4 border-foreground neo-shadow p-6 bg-accent text-accent-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase opacity-90">Market Cap</p>
                <p className="text-3xl font-black mt-1">${totalMarketCap.toFixed(0)}B</p>
              </div>
              <Target className="w-12 h-12 opacity-80" />
            </div>
          </Card>
        </div>

        {/* Main Table */}
        <div className="border-4 border-foreground bg-card neo-shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-foreground text-background">
                <tr>
                  <th className="px-4 py-4 text-left font-black uppercase text-xs border-r-4 border-background">
                    Asset
                  </th>
                  <th className="px-4 py-4 text-right font-black uppercase text-xs border-r-4 border-background">
                    Price
                  </th>
                  <th className="px-4 py-4 text-right font-black uppercase text-xs border-r-4 border-background">
                    24h
                  </th>
                  <th className="px-4 py-4 text-center font-black uppercase text-xs border-r-4 border-background">
                    Signal
                  </th>
                  <th className="px-4 py-4 text-center font-black uppercase text-xs border-r-4 border-background">
                    AI
                  </th>
                  <th className="px-4 py-4 text-center font-black uppercase text-xs border-r-4 border-background">
                    Target
                  </th>
                  <th className="px-4 py-4 text-center font-black uppercase text-xs border-r-4 border-background">
                    Stop
                  </th>
                  <th className="px-4 py-4 text-center font-black uppercase text-xs">Indicators</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin" />
                        <span className="font-bold">Loading top 100 tokens...</span>
                      </div>
                    </td>
                  </tr>
                ) : cryptoData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center font-bold text-muted-foreground">
                      No data available. Click Refresh to fetch data.
                    </td>
                  </tr>
                ) : (
                  cryptoData.map((crypto, index) => (
                    <tr
                      key={crypto.symbol}
                      className={`border-t-4 border-foreground hover:bg-muted transition-colors ${
                        index % 2 === 0 ? "bg-card" : "bg-muted/30"
                      }`}
                    >
                      <td className="px-4 py-3 border-r-4 border-foreground">
                        <div>
                          <div className="font-black text-base">{crypto.symbol}</div>
                          <div className="text-xs text-muted-foreground font-bold">
                            {crypto.historyLength ? `${crypto.historyLength}h` : "No data"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-sm border-r-4 border-foreground">
                        $
                        {crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right border-r-4 border-foreground">
                        <div
                          className={`inline-flex items-center gap-1 font-black text-sm ${
                            crypto.change24h > 0
                              ? "text-secondary"
                              : crypto.change24h < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {getTrendIcon(crypto.change24h)}
                          {Math.abs(crypto.change24h).toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center border-r-4 border-foreground">
                        <Badge
                          className={`${getSignalColor(
                            crypto.signal,
                          )} border-2 border-foreground font-black uppercase px-2 py-1 text-xs`}
                        >
                          {crypto.signal}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center border-r-4 border-foreground">
                        {crypto.aiSignal ? (
                          <div className="flex flex-col items-center gap-1">
                            <Badge
                              className={`${getSignalColor(
                                crypto.aiSignal,
                              )} border-2 border-foreground font-black uppercase px-2 py-1 text-xs`}
                            >
                              {crypto.aiSignal}
                            </Badge>
                            <span className="text-xs font-bold text-muted-foreground">
                              {(crypto.aiConfidence! * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center border-r-4 border-foreground">
                        {crypto.target ? (
                          <div className="font-bold text-xs text-secondary">
                            ${crypto.target}
                            <div className="text-[10px] text-muted-foreground">+3%</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center border-r-4 border-foreground">
                        {crypto.stop ? (
                          <div className="font-bold text-xs text-destructive">
                            ${crypto.stop}
                            <div className="text-[10px] text-muted-foreground">-2%</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {crypto.indicators ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            <Badge
                              variant="outline"
                              className="border-2 border-foreground font-bold text-[10px] px-1.5 py-0.5"
                            >
                              EMA: {crypto.indicators.ema8.toFixed(0)}/{crypto.indicators.ema21.toFixed(0)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-2 border-foreground font-bold text-[10px] px-1.5 py-0.5"
                            >
                              MACD: {crypto.indicators.macd.toFixed(2)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-2 border-foreground font-bold text-[10px] px-1.5 py-0.5"
                            >
                              RSI: {(crypto.indicators.stochRsi * 100).toFixed(0)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-2 border-foreground font-bold text-[10px] px-1.5 py-0.5"
                            >
                              {crypto.indicators.trendline}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground">Insufficient data</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="border-4 border-foreground bg-card p-4 neo-shadow text-center">
          <p className="font-bold text-sm text-muted-foreground">
            Powered by CoinGecko & Hugging Face AI • Auto-refresh: 2min • Targeting 3% returns with 1.5:1 R/R
          </p>
        </div>
      </div>
    </div>
  )
}
