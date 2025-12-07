"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckSquare, AlertTriangle, TrendingUp, Shield } from "lucide-react"

export function EntryInstructionsCard() {
  return (
    <Card className="p-6 border-border bg-card">
      <div className="flex items-center gap-3 mb-6">
        <CheckSquare className="h-6 w-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Trade Entry Checklist</h3>
          <p className="text-sm text-muted-foreground">Step-by-step execution guide</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Pre-Trade Requirements */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="bg-primary/10">
              Pre-Trade
            </Badge>
            <h4 className="font-semibold text-sm text-foreground">Requirements Before Entry</h4>
          </div>
          <ul className="space-y-2 ml-4">
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong className="text-foreground">4H Score:</strong> Minimum 3/5 confirmations (ADX, Volume, EMA
                Alignment)
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong className="text-foreground">1H Score:</strong> Minimum 2/5 confirmations with ADX {">"}15
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong className="text-foreground">15M & 5M:</strong> At least 1/5 each for lower timeframe
                confirmation
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong className="text-foreground">Trend Direction:</strong> Must show "Bullish" or "Bearish" (NOT
                Ranging)
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong className="text-foreground">Session Filter:</strong> Trade during London or NY session (avoid
                Asian unless high volatility)
              </span>
            </li>
          </ul>
        </div>

        {/* Alert Tiers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="bg-chart-4/10">
              Alert Stages
            </Badge>
            <h4 className="font-semibold text-sm text-foreground">Progressive Entry System</h4>
          </div>
          <div className="space-y-3 ml-4">
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5 bg-muted text-muted-foreground">0-1/4</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">No Alert</p>
                <p className="text-xs text-muted-foreground">Insufficient setup - continue monitoring</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5 bg-chart-4 text-chart-4-foreground">2/4</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Get Ready Alert</p>
                <p className="text-xs text-muted-foreground">
                  Partial confirmation - prepare your trading platform, check spreads
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5 bg-primary text-primary-foreground">3/4</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Limit Order Alert</p>
                <p className="text-xs text-muted-foreground">
                  Strong setup - place limit order at breakout level with stop loss details provided
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5 bg-success text-success-foreground">4/4</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Enter Now!</p>
                <p className="text-xs text-muted-foreground">
                  Full confirmation - breakout confirmed on 5M, enter at market with provided levels
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Execution */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="bg-success/10">
              Execution
            </Badge>
            <h4 className="font-semibold text-sm text-foreground">When Entering the Trade</h4>
          </div>
          <ul className="space-y-2 ml-4">
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <TrendingUp className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-foreground">Entry:</strong> Use provided breakout level or market price from 4/4
                alert
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <Shield className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-foreground">Stop Loss:</strong> Set at Chandelier Stop level (updates
                dynamically)
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-foreground">TP1 (2x ATR):</strong> Close 50% of position, move stop to breakeven
              </span>
            </li>
            <li className="text-sm text-muted-foreground flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-foreground">TP2 (4x ATR):</strong> Close remaining 50%, let Chandelier trail if
                strong trend
              </span>
            </li>
          </ul>
        </div>

        {/* Risk Warning */}
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-destructive mb-1">Important Risk Management</p>
              <p className="text-xs text-muted-foreground">
                Never risk more than 2% of account per trade. If 3 consecutive losses occur, system will lock out until
                manual review. Respect the Chandelier Stop - it adapts to volatility.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
