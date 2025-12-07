"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Shield, AlertTriangle, Lock } from "lucide-react"
import type { RiskManagement } from "@/lib/types/trading"

interface RiskManagementPanelProps {
  riskManagement: RiskManagement
}

export function RiskManagementPanel({ riskManagement }: RiskManagementPanelProps) {
  const sessionProgress = (riskManagement.currentSessionTrades / riskManagement.maxTradesPerSession) * 100
  const lossProgress = (riskManagement.consecutiveLosses / riskManagement.lockoutThreshold) * 100

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Risk Management</h2>
        {riskManagement.isLockedOut && (
          <Badge variant="destructive" className="ml-auto">
            <Lock className="h-3 w-3 mr-1" />
            Locked Out
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Max Risk Per Trade */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Max Risk Per Trade</span>
            <span className="text-lg font-semibold text-foreground">{riskManagement.maxRiskPerTrade}%</span>
          </div>
          <div className="text-xs text-muted-foreground">Of account balance</div>
        </div>

        {/* Session Trades */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Session Trades</span>
            <span className="text-lg font-semibold text-foreground">
              {riskManagement.currentSessionTrades}/{riskManagement.maxTradesPerSession}
            </span>
          </div>
          <Progress value={sessionProgress} className="h-2" />
          <div className="text-xs text-muted-foreground">{sessionProgress.toFixed(0)}% of limit</div>
        </div>

        {/* Consecutive Losses */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Consecutive Losses</span>
            <span
              className={`text-lg font-semibold ${riskManagement.consecutiveLosses >= 2 ? "text-destructive" : "text-foreground"}`}
            >
              {riskManagement.consecutiveLosses}/{riskManagement.lockoutThreshold}
            </span>
          </div>
          <Progress value={lossProgress} className="h-2" />
          {riskManagement.consecutiveLosses >= 2 && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <span>Approaching lockout</span>
            </div>
          )}
        </div>
      </div>

      {riskManagement.isLockedOut && (
        <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-lg">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-destructive mb-1">Trading Locked</div>
              <div className="text-xs text-muted-foreground">
                Trading has been automatically locked after {riskManagement.consecutiveLosses} consecutive losses.
                Manual intervention required.
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
