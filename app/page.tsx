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

  const fetchMarketData = async () => {
    try {
      setRefreshing(true)
      const response = await fetch("/api/signals")
      const result = await response.json()

      if (result.success) {
        setMarketData(result.data)
      }
    } catch (error) {
      console.error("Error fetching market data:", error)
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

  useEffect(() => {
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 60000)
    return () => clearInterval(interval)
  }, [])

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
