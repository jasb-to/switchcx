// Market context intelligence for better signal quality

import type { MarketContext, EconomicEvent } from "../types/trading"

export async function getMarketContext(): Promise<MarketContext> {
  // In production, integrate with:
  // - DXY (US Dollar Index) data
  // - Economic calendar API (investing.com, forexfactory)
  // - News sentiment API

  try {
    // For now, return neutral context
    // TODO: Integrate real data sources
    return {
      dxyStrength: "neutral",
      economicEvents: await getUpcomingEconomicEvents(),
      correlationScore: 50,
      volatilityRegime: "normal",
      confidenceAdjustment: 0,
    }
  } catch (error) {
    console.error("[v0] Error fetching market context:", error)
    return {
      dxyStrength: "neutral",
      economicEvents: [],
      correlationScore: 50,
      volatilityRegime: "normal",
      confidenceAdjustment: 0,
    }
  }
}

async function getUpcomingEconomicEvents(): Promise<EconomicEvent[]> {
  // TODO: Integrate with economic calendar API
  // For now, return empty array
  // In production, fetch from: https://www.forexfactory.com/calendar
  return []
}

export function assessVolatilityRegime(atr: number, historicalATR: number[]): "low" | "normal" | "high" | "extreme" {
  const avg = historicalATR.reduce((sum, v) => sum + v, 0) / historicalATR.length
  const ratio = atr / avg

  if (ratio > 2.5) return "extreme"
  if (ratio > 1.5) return "high"
  if (ratio < 0.5) return "low"
  return "normal"
}

export function shouldAvoidTrading(context: MarketContext): boolean {
  // Avoid trading during high-impact news
  const hasHighImpactEvent = context.economicEvents.some((event) => event.impact === "high" && isWithinHour(event.time))

  // Avoid extreme volatility regimes
  const extremeVolatility = context.volatilityRegime === "extreme"

  return hasHighImpactEvent || extremeVolatility
}

function isWithinHour(eventTime: string): boolean {
  try {
    const eventDate = new Date(eventTime)
    const now = new Date()
    const diff = Math.abs(eventDate.getTime() - now.getTime())
    return diff < 60 * 60 * 1000 // Within 1 hour
  } catch {
    return false
  }
}
