"use client"

import { TrendingUp, TrendingDown, Minus, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Direction, TradingSession } from "@/lib/types/trading"

interface MarketHeaderProps {
  currentPrice: number
  trend4h: Direction
  trend1h: Direction
  session: TradingSession
  isChopRange: boolean
  volatilityScore: number
  confirmationTier: number
  isMarketOpen: boolean
  marketStatusMessage: string
}

export function MarketHeader({
  currentPrice,
  trend4h,
  trend1h,
  session,
  isChopRange,
  volatilityScore,
  confirmationTier,
  isMarketOpen,
  marketStatusMessage,
}: MarketHeaderProps) {
  const getTrendIcon = (trend: Direction) => {
    if (trend === "bullish") return <TrendingUp className="h-4 w-4" />
    if (trend === "bearish") return <TrendingDown className="h-4 w-4" />
    return <Minus className="h-4 w-4" />
  }

  const getTrendColor = (trend: Direction) => {
    if (trend === "bullish") return "text-success"
    if (trend === "bearish") return "text-destructive"
    return "text-muted-foreground"
  }

  const getSessionBadge = (session: TradingSession) => {
    const variants: Record<TradingSession, string> = {
      overlap: "gold-gradient text-primary-foreground",
      london: "bg-chart-2 text-success-foreground",
      new_york: "bg-chart-4 text-foreground",
      asian: "bg-muted text-muted-foreground",
    }

    const labels: Record<TradingSession, string> = {
      overlap: "London/NY Overlap",
      london: "London",
      new_york: "New York",
      asian: "Asian",
    }

    return <Badge className={variants[session]}>{labels[session]}</Badge>
  }

  const getTierColor = (tier: number) => {
    if (tier === 0 || tier === 1) return "bg-muted"
    if (tier === 2) return "bg-yellow-500"
    if (tier === 3) return "bg-orange-500"
    return "bg-success"
  }

  const getTierLabel = (tier: number) => {
    if (tier === 0 || tier === 1) return "No Signal"
    if (tier === 2) return "Get Ready"
    if (tier === 3) return "Limit Order"
    return "Enter Now!"
  }

  return (
    <Card className="p-6 border-border">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Price Section */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">XAU/USD</div>
          <div className="text-4xl font-bold text-primary">${currentPrice.toFixed(2)}</div>
          {/* Market Status Indicator */}
          <div className="flex items-center gap-2 mt-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`text-sm font-medium ${isMarketOpen ? "text-success" : "text-destructive"}`}>
              {marketStatusMessage}
            </span>
          </div>
        </div>

        {/* Confirmation Tier Section */}
        <div className="flex-1 max-w-md">
          <div className="text-sm text-muted-foreground mb-2 flex items-center justify-between">
            <span>Confirmation Level</span>
            <span className="font-semibold">{confirmationTier}/4</span>
          </div>
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3, 4].map((tier) => (
              <div
                key={tier}
                className={`h-3 flex-1 rounded-sm transition-all ${
                  tier <= confirmationTier ? getTierColor(confirmationTier) : "bg-muted/30"
                }`}
              />
            ))}
          </div>
          <div className="text-center">
            <Badge
              className={`${confirmationTier >= 3 ? "gold-gradient animate-pulse" : confirmationTier === 2 ? "bg-yellow-500" : "bg-muted"}`}
            >
              {isMarketOpen ? getTierLabel(confirmationTier) : "Market Closed"}
            </Badge>
          </div>
        </div>

        {/* Trends Section */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-3 bg-accent/50 px-4 py-3 rounded-lg">
            <div className="text-sm text-muted-foreground">4H Trend</div>
            <div className={`flex items-center gap-1.5 font-semibold ${getTrendColor(trend4h)}`}>
              {getTrendIcon(trend4h)}
              <span className="uppercase text-sm">{trend4h}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-accent/50 px-4 py-3 rounded-lg">
            <div className="text-sm text-muted-foreground">1H Trend</div>
            <div className={`flex items-center gap-1.5 font-semibold ${getTrendColor(trend1h)}`}>
              {getTrendIcon(trend1h)}
              <span className="uppercase text-sm">{trend1h}</span>
            </div>
          </div>
        </div>

        {/* Status Section */}
        <div className="flex flex-wrap gap-3">
          {getSessionBadge(session)}

          {isChopRange && isMarketOpen && (
            <Badge variant="outline" className="border-destructive text-destructive">
              Chop Range
            </Badge>
          )}

          <div className="flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-lg">
            <div className="text-xs text-muted-foreground">Volatility</div>
            <div className="text-sm font-semibold text-foreground">{volatilityScore.toFixed(0)}/100</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
