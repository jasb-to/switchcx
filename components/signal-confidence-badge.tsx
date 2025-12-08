"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, AlertTriangle, Minus, Shield } from "lucide-react"
import type { SignalConfidence } from "@/lib/types/trading"

interface SignalConfidenceBadgeProps {
  confidence: SignalConfidence
  showDetails?: boolean
}

export function SignalConfidenceBadge({ confidence, showDetails = false }: SignalConfidenceBadgeProps) {
  const getIcon = () => {
    if (confidence.recommendation === "strong_buy") return <TrendingUp className="h-3 w-3" />
    if (confidence.recommendation === "buy") return <Shield className="h-3 w-3" />
    if (confidence.recommendation === "avoid") return <AlertTriangle className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  const getColor = () => {
    if (confidence.score >= 80) return "bg-success text-success-foreground"
    if (confidence.score >= 65) return "bg-primary text-primary-foreground"
    if (confidence.score >= 50) return "bg-chart-4 text-foreground"
    return "bg-destructive text-destructive-foreground"
  }

  const getLabel = () => {
    if (confidence.score >= 80) return "HIGH CONFIDENCE"
    if (confidence.score >= 65) return "GOOD CONFIDENCE"
    if (confidence.score >= 50) return "MODERATE"
    return "LOW CONFIDENCE"
  }

  if (!showDetails) {
    return (
      <Badge className={`gap-1 ${getColor()}`}>
        {getIcon()}
        {confidence.score}/100
      </Badge>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`gap-1 ${getColor()} cursor-help`}>
            {getIcon()}
            {getLabel()} ({confidence.score}/100)
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="w-64">
          <div className="space-y-2">
            <p className="font-semibold text-sm">Confidence Factors:</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Breakout Quality:</span>
                <span className="font-semibold">{confidence.factors.breakoutQuality.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span>Volume Surge:</span>
                <span className="font-semibold">{confidence.factors.volumeSurge.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span>Timeframe Alignment:</span>
                <span className="font-semibold">{confidence.factors.timeframeAlignment.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span>Market Context:</span>
                <span className="font-semibold">{confidence.factors.marketContext.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span>Historical Success:</span>
                <span className="font-semibold">{confidence.factors.historicalSuccess.toFixed(0)}%</span>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="font-semibold text-sm">
                Recommendation: {confidence.recommendation.replace("_", " ").toUpperCase()}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
