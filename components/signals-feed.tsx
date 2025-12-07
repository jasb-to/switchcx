"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, TrendingUp, TrendingDown, Clock } from "lucide-react"

export function SignalsFeed() {
  // This would be populated from your API in production
  const signals = [
    {
      id: "1",
      type: "entry",
      direction: "long",
      price: 2048.5,
      time: "2 min ago",
      status: "active",
    },
    {
      id: "2",
      type: "exit",
      direction: "long",
      price: 2052.3,
      time: "15 min ago",
      status: "closed",
      pnl: 380,
    },
  ]

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Live Signals Feed</h2>
        <Badge variant="outline" className="ml-auto">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse mr-1.5" />
          Live
        </Badge>
      </div>

      <div className="space-y-3">
        {signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No signals yet. Monitoring market conditions...</p>
          </div>
        ) : (
          signals.map((signal) => (
            <div key={signal.id} className="flex items-center gap-4 p-4 bg-accent/30 rounded-lg border border-border">
              <div className={`p-2 rounded-lg ${signal.direction === "long" ? "bg-success/20" : "bg-destructive/20"}`}>
                {signal.direction === "long" ? (
                  <TrendingUp className="h-5 w-5 text-success" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold uppercase text-sm text-foreground">{signal.direction}</span>
                  <Badge
                    variant={signal.status === "active" ? "default" : "outline"}
                    className={signal.status === "active" ? "bg-primary text-primary-foreground" : ""}
                  >
                    {signal.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{signal.time}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Price: ${signal.price.toFixed(2)}</span>
                  {signal.pnl && (
                    <span className={signal.pnl > 0 ? "text-success" : "text-destructive"}>
                      P&L: ${signal.pnl.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Next scan in:</span>
        <span className="font-semibold text-foreground">8m 32s</span>
      </div>
    </Card>
  )
}
