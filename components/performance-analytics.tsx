"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, Target, Activity, Zap } from "lucide-react"
import type { PerformanceMetrics } from "@/lib/types/trading"

interface PerformanceAnalyticsProps {
  metrics: PerformanceMetrics
}

export function PerformanceAnalytics({ metrics }: PerformanceAnalyticsProps) {
  const getWinRateColor = (rate: number) => {
    if (rate >= 70) return "text-success"
    if (rate >= 50) return "text-primary"
    return "text-destructive"
  }

  const formatCurrency = (value: number) => {
    const sign = value >= 0 ? "+" : ""
    return `${sign}$${value.toFixed(2)}`
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Performance Analytics</h2>
        <Badge variant="outline" className="ml-auto">
          {metrics.totalTrades} Trades
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Win Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Win Rate</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className={`text-3xl font-bold ${getWinRateColor(metrics.winRate)}`}>{metrics.winRate.toFixed(1)}%</div>
          <Progress value={metrics.winRate} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </div>
        </div>

        {/* Profit Factor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Profit Factor</span>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="text-3xl font-bold text-foreground">{metrics.profitFactor.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Avg Win: {formatCurrency(metrics.avgWin)}</div>
          <div className="text-xs text-muted-foreground">Avg Loss: {formatCurrency(-metrics.avgLoss)}</div>
        </div>

        {/* Total P&L */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total P&L</span>
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className={`text-3xl font-bold ${metrics.totalPnl >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(metrics.totalPnl)}
          </div>
          <div className="text-xs text-muted-foreground">Best: {formatCurrency(metrics.bestTrade)}</div>
          <div className="text-xs text-muted-foreground">Worst: {formatCurrency(metrics.worstTrade)}</div>
        </div>

        {/* R-Multiple & Sharpe */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Quality Metrics</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{metrics.avgRMultiple.toFixed(2)}R</div>
          <div className="text-xs text-muted-foreground">Avg R-Multiple</div>
          <div className="text-xs text-muted-foreground">Sharpe: {metrics.sharpeRatio.toFixed(2)}</div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="mt-6 pt-6 border-t border-border grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Max Drawdown</p>
          <p className="text-lg font-semibold text-destructive">{formatCurrency(-metrics.maxDrawdown)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Avg Hold Time</p>
          <p className="text-lg font-semibold text-foreground">{formatTime(metrics.avgHoldTime)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Trade Quality</p>
          <Badge
            className={
              metrics.profitFactor >= 2 ? "bg-success" : metrics.profitFactor >= 1.5 ? "bg-primary" : "bg-muted"
            }
          >
            {metrics.profitFactor >= 2 ? "Excellent" : metrics.profitFactor >= 1.5 ? "Good" : "Developing"}
          </Badge>
        </div>
      </div>
    </Card>
  )
}
