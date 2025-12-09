"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { TimeframeScore } from "@/lib/types/trading"

interface TimeframeScoreboardProps {
  scores: TimeframeScore[]
}

export function TimeframeScoreboard({ scores }: TimeframeScoreboardProps) {
  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100
    if (percentage >= 80) return "text-success"
    if (percentage >= 60) return "text-primary"
    if (percentage >= 40) return "text-chart-4"
    return "text-destructive"
  }

  const getCriteriaStatus = (value: boolean) => {
    return value ? (
      <CheckCircle2 className="h-4 w-4 text-success" />
    ) : (
      <XCircle className="h-4 w-4 text-muted-foreground" />
    )
  }

  const getRequiredScore = (timeframe: string) => {
    const requirements: Record<string, number> = {
      "4h": 3,
      "1h": 2,
      "15m": 1,
      "5m": 1,
    }
    return requirements[timeframe] || 0
  }

  const getTrendBadge = (trend?: string) => {
    if (!trend) return null

    if (trend === "bullish") {
      return (
        <Badge className="bg-success text-success-foreground flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Bullish
        </Badge>
      )
    }

    if (trend === "bearish") {
      return (
        <Badge className="bg-destructive text-destructive-foreground flex items-center gap-1">
          <TrendingDown className="h-3 w-3" />
          Bearish
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="flex items-center gap-1 border-muted-foreground/30">
        <Minus className="h-3 w-3" />
        Ranging
      </Badge>
    )
  }

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Multi-Timeframe Analysis</h2>
        <Badge variant="outline">5-Point Scoring System</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {scores.map((score) => {
          const percentage = (score.score / score.maxScore) * 100
          const required = getRequiredScore(score.timeframe)
          const meetsRequirement = score.score >= required

          return (
            <Card key={score.timeframe} className="p-4 bg-accent/30 border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold uppercase text-sm text-foreground">{score.timeframe}</h3>
                {getTrendBadge(score.trendDirection)}
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className={`text-3xl font-bold ${getScoreColor(score.score, score.maxScore)}`}>
                  {score.score}/{score.maxScore}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-0.5">Min: {required}/5</div>
                  {meetsRequirement ? (
                    <Badge className="text-xs bg-success text-success-foreground">Valid</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border-destructive text-destructive">
                      Invalid
                    </Badge>
                  )}
                </div>
              </div>

              <Progress value={percentage} className="h-2 mb-3" />

              {score.chandelierLong && score.chandelierShort && (
                <div className="mb-3 pb-3 border-b border-border">
                  <div className="text-xs text-muted-foreground mb-1.5">Chandelier Stops</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-success flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Long: ${score.chandelierLong.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-0.5">
                    <span className="text-destructive flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Short: ${score.chandelierShort.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    ADX {score.adxValue ? `(${score.adxValue.toFixed(1)})` : "(N/A)"}
                  </span>
                  {getCriteriaStatus(score.criteria.adx)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Volume</span>
                  {getCriteriaStatus(score.criteria.volume)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">EMA Alignment</span>
                  {getCriteriaStatus(score.criteria.emaAlignment)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Trend Direction</span>
                  {getCriteriaStatus(score.criteria.trendDirection)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Volatility</span>
                  {getCriteriaStatus(score.criteria.volatility)}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </Card>
  )
}
