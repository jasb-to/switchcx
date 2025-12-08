"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Shield, Target } from "lucide-react"
import type { TradingSignal } from "@/lib/types/trading"

interface ActiveTradeCardProps {
  signal: TradingSignal | null
  currentPrice: number
}

export function ActiveTradeCard({ signal, currentPrice }: ActiveTradeCardProps) {
  if (!signal) {
    return (
      <Card className="p-6 border-border bg-card">
        <div className="text-center py-8">
          <div className="mb-4 opacity-40">
            <Target className="h-12 w-12 mx-auto text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Active Trade</h3>
          <p className="text-sm text-muted-foreground">Waiting for setup confirmation across all timeframes</p>
        </div>
      </Card>
    )
  }

  const isLong = signal.direction === "bullish"
  const pnl = isLong ? currentPrice - signal.entryPrice : signal.entryPrice - currentPrice
  const pnlPercent = (pnl / signal.entryPrice) * 100

  // Calculate take profit levels based on ATR
  const atr = signal.volatility.atr
  const tp1 = isLong ? signal.entryPrice + atr * 2 : signal.entryPrice - atr * 2
  const tp2 = isLong ? signal.entryPrice + atr * 4 : signal.entryPrice - atr * 4

  const isPending = signal.status === "pending"
  const title = isPending ? "Limit Order Ready" : "Active Trade"
  const borderColor = isPending ? "border-warning/30" : "border-primary/30"

  return (
    <Card className={`p-6 ${borderColor} bg-card`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isLong ? (
            <TrendingUp className="h-6 w-6 text-success" />
          ) : (
            <TrendingDown className="h-6 w-6 text-destructive" />
          )}
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{signal.session.replace("_", " ").toUpperCase()} Session</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isLong ? "default" : "destructive"} className="text-sm px-3 py-1 font-bold">
            {isLong ? "LONG" : "SHORT"}
          </Badge>
          <span className="text-xs text-muted-foreground">{signal.direction}</span>
        </div>
      </div>

      {isPending && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-md">
          <p className="text-sm text-warning font-medium">3/4 Confirmations - Prepare Limit Order</p>
          <p className="text-xs text-muted-foreground mt-1">
            Waiting for final 5M confirmation. Place limit order at entry price.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Entry Price */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Entry Price</p>
          <p className="text-lg font-bold text-foreground">${signal.entryPrice.toFixed(2)}</p>
        </div>

        {/* Current Price */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Current Price</p>
          <p className="text-lg font-bold text-foreground">${currentPrice.toFixed(2)}</p>
          <p className={`text-xs font-medium ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnl >= 0 ? "+" : ""}
            {pnlPercent.toFixed(2)}%)
          </p>
        </div>

        {/* Stop Loss */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Stop Loss
          </p>
          <p className="text-lg font-bold text-destructive">${signal.stopLoss.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            Risk: ${Math.abs(signal.entryPrice - signal.stopLoss).toFixed(2)}
          </p>
        </div>

        {/* Chandelier Exit */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Chandelier Stop
          </p>
          <p className="text-lg font-bold text-primary">${signal.chandelierStop.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Dynamic trailing stop</p>
        </div>
      </div>

      {/* Take Profit Levels */}
      <div className="mt-6 pt-4 border-t border-border">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Take Profit 1 (2x ATR)
            </p>
            <p className="text-lg font-bold text-success">${tp1.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Close 50% position</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Take Profit 2 (4x ATR)
            </p>
            <p className="text-lg font-bold text-success">${tp2.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Close remaining 50%</p>
          </div>
        </div>
      </div>

      {/* Breakout Info */}
      <div className="mt-4 p-3 bg-accent/20 rounded-md">
        <p className="text-xs text-muted-foreground">
          <strong>Breakout Zone:</strong> {signal.breakoutZone.type} @ ${signal.breakoutZone.level.toFixed(2)} (
          {signal.breakoutZone.touches} touches)
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <strong>{isPending ? "Preview Generated" : "Entry Time"}:</strong>{" "}
          {new Date(signal.timestamp).toLocaleString()}
        </p>
      </div>
    </Card>
  )
}
