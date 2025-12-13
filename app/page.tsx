"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { MarketHeader } from "@/components/market-header"
import { TimeframeScoreboard } from "@/components/timeframe-scoreboard"
import { ActiveTradeCard } from "@/components/active-trade-card"
import { EntryInstructionsCard } from "@/components/entry-instructions-card"
import { PerformanceAnalytics } from "@/components/performance-analytics"
import { SignalConfidenceBadge } from "@/components/signal-confidence-badge"
import { RefreshCw, Send } from "lucide-react"
import type {
  Direction,
  TradingSession,
  TimeframeScore,
  TradingSignal,
  PerformanceMetrics,
  SignalConfidence,
  MarketContext,
} from "@/lib/types/trading"

interface MarketData {
  currentPrice: number
  currentSession: TradingSession
  trend4h: Direction
  trend1h: Direction
  trend15m: Direction
  trend5m: Direction
  isChopRange: boolean
  volatility: {
    atr: number
    rangeExpansion: boolean
    rangeCompression: boolean
    volatilityScore: number
  }
  timeframeScores: TimeframeScore[]
  confirmationTier: number
  signalMode: "conservative" | "aggressive" | "none"
  lastUpdate: number
  activeSignal?: TradingSignal
  rejectionReason?: string
  isMarketOpen: boolean
  marketStatusMessage: string
  signalConfidence?: SignalConfidence
  marketContext?: MarketContext
  performanceMetrics?: PerformanceMetrics
  newsFilterActive?: boolean
  newsFilterReason?: string | null
}

export default function HomePage() {
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [backtestLoading, setBacktestLoading] = useState(false)
  const [backtestResults, setBacktestResults] = useState<any | null>(null)

  const fetchMarketData = async () => {
    try {
      setRefreshing(true)
      setApiError(null)
      const response = await fetch("/api/signals")
      const result = await response.json()

      if (result.success) {
        if (result.data.rejectionReason?.includes("Daily API limit")) {
          setApiError(result.data.rejectionReason)
        }
        setMarketData(result.data)
      }
    } catch (error) {
      console.error("Error fetching market data:", error)
      setApiError("Failed to connect to server. Please try again later.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const testTelegram = async () => {
    try {
      setTestingTelegram(true)
      const response = await fetch("/api/telegram/test")
      const result = await response.json()

      if (result.success) {
        alert("Telegram test message sent successfully!")
      } else {
        alert(`Telegram test failed: ${result.error}`)
      }
    } catch (error) {
      console.error("Error testing Telegram:", error)
      alert("Failed to send Telegram test message")
    } finally {
      setTestingTelegram(false)
    }
  }

  const runBacktest = async () => {
    try {
      setBacktestLoading(true)
      const response = await fetch("/api/backtest")
      const result = await response.json()

      if (result.success) {
        setBacktestResults(result.data)
      } else {
        alert(`Backtest failed: ${result.error}`)
      }
    } catch (error) {
      console.error("Error running backtest:", error)
      alert("Failed to run backtest")
    } finally {
      setBacktestLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketData()
    const interval = setInterval(() => {
      if (!apiError) {
        fetchMarketData()
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [apiError])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading market data...</p>
        </div>
      </div>
    )
  }

  if (!marketData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load market data</p>
          <Button onClick={fetchMarketData}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                <span className="gold-gradient bg-clip-text text-transparent">SwitchCX</span>
              </h1>
              <p className="text-sm text-muted-foreground">Gold Breakout Trading System</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={runBacktest}
                disabled={backtestLoading}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 ${backtestLoading ? "animate-spin" : ""}`} />
                Run Backtest
              </Button>
              <Button
                onClick={testTelegram}
                disabled={testingTelegram}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <Send className={`h-4 w-4 ${testingTelegram ? "animate-pulse" : ""}`} />
                Test Telegram
              </Button>
              <Button
                onClick={fetchMarketData}
                disabled={refreshing}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {apiError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-destructive">⚠️</div>
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">API Limit Reached</h3>
                <p className="text-sm text-muted-foreground">{apiError}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Auto-refresh paused. Existing active trades are still being monitored.
                </p>
              </div>
              <Button
                onClick={() => {
                  setApiError(null)
                  fetchMarketData()
                }}
                variant="outline"
                size="sm"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {backtestResults && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Backtest Results (Last 200 Candles)</h2>
              <Button onClick={() => setBacktestResults(null)} variant="ghost" size="sm">
                Close
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Conservative Strategy */}
              <div className="border border-border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 text-primary">Conservative Mode</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Trades:</span>
                    <span className="font-medium">{backtestResults.conservative.totalTrades || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Winners:</span>
                    <span className="font-medium text-green-500">{backtestResults.conservative.wins || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Losers:</span>
                    <span className="font-medium text-red-500">{backtestResults.conservative.losses || 0}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 mt-2">
                    <span className="text-muted-foreground">Win Rate:</span>
                    <span className="font-medium">
                      {backtestResults.conservative.winRate != null
                        ? (backtestResults.conservative.winRate * 100).toFixed(1)
                        : "0.0"}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total P&L:</span>
                    <span
                      className={`font-medium ${(backtestResults.conservative.totalProfitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                    >
                      $
                      {backtestResults.conservative.totalProfitLoss != null
                        ? backtestResults.conservative.totalProfitLoss.toFixed(2)
                        : "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg R-Multiple:</span>
                    <span className="font-medium">
                      {backtestResults.conservative.avgRMultiple != null
                        ? backtestResults.conservative.avgRMultiple.toFixed(2)
                        : "0.00"}
                      R
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Drawdown:</span>
                    <span className="font-medium text-red-500">
                      $
                      {backtestResults.conservative.maxDrawdown != null
                        ? backtestResults.conservative.maxDrawdown.toFixed(2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aggressive Strategy */}
              <div className="border border-border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 text-primary">Aggressive Mode</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Trades:</span>
                    <span className="font-medium">{backtestResults.aggressive.totalTrades || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Winners:</span>
                    <span className="font-medium text-green-500">{backtestResults.aggressive.wins || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Losers:</span>
                    <span className="font-medium text-red-500">{backtestResults.aggressive.losses || 0}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 mt-2">
                    <span className="text-muted-foreground">Win Rate:</span>
                    <span className="font-medium">
                      {backtestResults.aggressive.winRate != null
                        ? (backtestResults.aggressive.winRate * 100).toFixed(1)
                        : "0.0"}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total P&L:</span>
                    <span
                      className={`font-medium ${(backtestResults.aggressive.totalProfitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                    >
                      $
                      {backtestResults.aggressive.totalProfitLoss != null
                        ? backtestResults.aggressive.totalProfitLoss.toFixed(2)
                        : "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg R-Multiple:</span>
                    <span className="font-medium">
                      {backtestResults.aggressive.avgRMultiple != null
                        ? backtestResults.aggressive.avgRMultiple.toFixed(2)
                        : "0.00"}
                      R
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Drawdown:</span>
                    <span className="font-medium text-red-500">
                      $
                      {backtestResults.aggressive.maxDrawdown != null
                        ? backtestResults.aggressive.maxDrawdown.toFixed(2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Recommendation</h4>
              <p className="text-sm text-muted-foreground">{backtestResults.analysis.winner}</p>
              <div className="mt-2 flex gap-4 text-xs">
                <span>Conservative Score: {backtestResults.analysis.conservativeScore}</span>
                <span>Aggressive Score: {backtestResults.analysis.aggressiveScore}</span>
              </div>
            </div>

            {(backtestResults.conservative.signals.length > 0 || backtestResults.aggressive.signals.length > 0) && (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Trade History</h3>

                {backtestResults.conservative.signals.length > 0 && (
                  <div className="border border-border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 text-sm text-primary">Conservative Trades</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {backtestResults.conservative.signals.map((trade: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between text-xs p-2 rounded border ${
                            trade.outcome === "win"
                              ? "border-green-500/20 bg-green-500/5"
                              : "border-red-500/20 bg-red-500/5"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium">
                              {trade.direction === "bullish" ? "LONG" : "SHORT"} @ ${trade.entry.toFixed(2)}
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(trade.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={trade.outcome === "win" ? "text-green-500" : "text-red-500"}>
                              {trade.rMultiple.toFixed(2)}R
                            </div>
                            <div className="text-muted-foreground text-[10px]">{trade.exitReason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {backtestResults.aggressive.signals.length > 0 && (
                  <div className="border border-border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 text-sm text-primary">Aggressive Trades</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {backtestResults.aggressive.signals.map((trade: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between text-xs p-2 rounded border ${
                            trade.outcome === "win"
                              ? "border-green-500/20 bg-green-500/5"
                              : "border-red-500/20 bg-red-500/5"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium">
                              {trade.direction === "bullish" ? "LONG" : "SHORT"} @ ${trade.entry.toFixed(2)}
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(trade.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={trade.outcome === "win" ? "text-green-500" : "text-red-500"}>
                              {trade.rMultiple.toFixed(2)}R
                            </div>
                            <div className="text-muted-foreground text-[10px]">{trade.exitReason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ML Note */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <strong>Note:</strong> This is a rule-based technical analysis system with NO machine learning. The
              strategy uses fixed EMA crossovers (50/200 conservative, 8/21 aggressive), MACD, RSI, and trendline
              breakout detection. There is no adaptive learning or pattern training.
            </div>
          </div>
        )}

        {/* Market Header */}
        <MarketHeader
          currentPrice={marketData.currentPrice}
          trend4h={marketData.trend4h}
          trend1h={marketData.trend1h}
          trend15m={marketData.trend15m}
          trend5m={marketData.trend5m}
          session={marketData.currentSession}
          isChopRange={marketData.isChopRange}
          volatilityScore={marketData.volatility.volatilityScore}
          confirmationTier={marketData.confirmationTier}
          signalMode={marketData.signalMode}
          isMarketOpen={marketData.isMarketOpen}
          marketStatusMessage={marketData.marketStatusMessage}
          newsFilterActive={marketData.newsFilterActive}
          newsFilterReason={marketData.newsFilterReason}
        />

        {/* Signal Confidence Badge */}
        {marketData.activeSignal && marketData.signalConfidence && (
          <div className="flex items-center justify-center gap-4">
            <span className="text-sm text-muted-foreground">Signal Quality:</span>
            <SignalConfidenceBadge confidence={marketData.signalConfidence} showDetails />
          </div>
        )}

        {/* Timeframe Scoreboard */}
        <TimeframeScoreboard scores={marketData.timeframeScores} />

        {/* Performance Analytics */}
        {marketData.performanceMetrics && marketData.performanceMetrics.totalTrades > 0 && (
          <PerformanceAnalytics metrics={marketData.performanceMetrics} />
        )}

        {/* Active Trade and Entry Instructions cards */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ActiveTradeCard
            signal={marketData.activeSignal || null}
            currentPrice={marketData.currentPrice}
            rejectionReason={marketData.rejectionReason}
            signalMode={marketData.signalMode}
          />
          <EntryInstructionsCard />
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-8 pb-4">
          <p>Last updated: {new Date(marketData.lastUpdate).toLocaleString()} • Cron runs every 10 minutes</p>
          <p className="mt-2">
            <strong className="text-primary">Real-time data from Twelve Data API</strong> • Alerts via Telegram
          </p>
          <p className="mt-1 text-xs">
            Alert Tiers: 0-1/4 (None) • 2/4 (Get Ready) • 3/4 (Limit Order) • 4/4 (Enter Now)
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Features: Performance Tracking • AI Confidence Scoring • Market Context Intelligence • Advanced Trade
            Management • Dual-Mode Strategy
          </p>
        </div>
      </main>
    </div>
  )
}
