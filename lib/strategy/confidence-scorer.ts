// AI-powered confidence scoring for signals

import type { TradingSignal, SignalConfidence, MarketContext } from "../types/trading"
import { tradeHistoryManager } from "../database/trade-history"

export function calculateSignalConfidence(
  signal: TradingSignal,
  marketContext: MarketContext,
  timeframeScores: any[],
): SignalConfidence {
  const factors = {
    breakoutQuality: assessBreakoutQuality(signal),
    volumeSurge: assessVolumeSurge(signal),
    timeframeAlignment: assessTimeframeAlignment(timeframeScores),
    marketContext: assessMarketContext(marketContext),
    historicalSuccess: assessHistoricalSuccess(signal),
  }

  // Weighted average
  const score =
    factors.breakoutQuality * 0.25 +
    factors.volumeSurge * 0.2 +
    factors.timeframeAlignment * 0.25 +
    factors.marketContext * 0.15 +
    factors.historicalSuccess * 0.15

  const recommendation = getRecommendation(score, marketContext)

  return {
    score: Math.round(score),
    factors,
    recommendation,
  }
}

function assessBreakoutQuality(signal: TradingSignal): number {
  if (!signal.breakoutZone) {
    // If there's a trendline breakout instead, return a moderate score
    return 65
  }

  const zone = signal.breakoutZone

  // Higher score for stronger zones (more touches)
  const touchScore = Math.min(100, (zone.touches || 2) * 25)

  // Higher score for higher zone strength
  const strengthScore = zone.strength || 50

  // Average the scores
  return (touchScore + strengthScore) / 2
}

function assessVolumeSurge(signal: TradingSignal): number {
  // This would need volume data from signal
  // For now, return 75 as we validate volume in strategy
  return 75
}

function assessTimeframeAlignment(scores: any[]): number {
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0)
  const maxScore = scores.reduce((sum, s) => sum + s.maxScore, 0)

  return (totalScore / maxScore) * 100
}

function assessMarketContext(context: MarketContext): number {
  let score = 50 // Start neutral

  // Reduce score for high-impact events
  const highImpactEvents = context.economicEvents.filter((e) => e.impact === "high").length
  score -= highImpactEvents * 15

  // Adjust for volatility regime
  if (context.volatilityRegime === "low") score -= 20
  if (context.volatilityRegime === "extreme") score -= 30
  if (context.volatilityRegime === "high") score += 10

  // Apply context confidence adjustment
  score += context.confidenceAdjustment

  return Math.max(0, Math.min(100, score))
}

function assessHistoricalSuccess(signal: TradingSignal): number {
  const historicalRate = tradeHistoryManager.getHistoricalSuccessRate(signal.entryPrice, signal.direction)

  return historicalRate
}

function getRecommendation(score: number, context: MarketContext): "strong_buy" | "buy" | "hold" | "avoid" {
  // Avoid if there are high-impact events
  if (context.economicEvents.some((e) => e.impact === "high")) {
    return "avoid"
  }

  if (score >= 80) return "strong_buy"
  if (score >= 65) return "buy"
  if (score >= 50) return "hold"
  return "avoid"
}
