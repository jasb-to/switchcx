import type { MarketContext, EconomicEvent } from "../types/trading"

// High-impact economic events that affect gold
const HIGH_IMPACT_KEYWORDS = [
  "FOMC",
  "Federal Reserve",
  "Interest Rate Decision",
  "NFP",
  "Non-Farm Payroll",
  "Nonfarm Payrolls",
  "Employment",
  "CPI",
  "Consumer Price Index",
  "Inflation",
  "GDP",
  "Powell",
  "Fed Chair",
  "ECB",
  "Central Bank",
]

export async function getMarketContext(): Promise<MarketContext> {
  try {
    const economicEvents = await getUpcomingEconomicEvents()

    return {
      dxyStrength: "neutral",
      economicEvents,
      correlationScore: 50,
      volatilityRegime: "normal",
      confidenceAdjustment: calculateConfidenceAdjustment(economicEvents),
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
  try {
    // Using Finnhub's free economic calendar API
    // Alternative: Use investing.com RSS feed or forexfactory scraping
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const fromDate = today.toISOString().split("T")[0]
    const toDate = tomorrow.toISOString().split("T")[0]

    // For now, return a static list of known high-impact events
    // In production, this would fetch from API
    const events: EconomicEvent[] = []

    // Check for known recurring events
    const currentHour = today.getUTCHours()
    const dayOfWeek = today.getUTCDay()

    // FOMC meetings are announced - typically 8 times per year at 2:00 PM ET (18:00 UTC)
    // NFP is first Friday of every month at 8:30 AM ET (12:30 UTC)
    if (dayOfWeek === 5 && today.getDate() <= 7 && currentHour >= 12 && currentHour <= 14) {
      events.push({
        time: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 30).toISOString(),
        event: "Non-Farm Payrolls (NFP)",
        country: "US",
        currency: "USD",
        impact: "high",
        forecast: null,
        previous: null,
      })
    }

    // Add CPI release - typically mid-month at 8:30 AM ET
    if (today.getDate() >= 12 && today.getDate() <= 15 && currentHour >= 12 && currentHour <= 14) {
      events.push({
        time: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 30).toISOString(),
        event: "Consumer Price Index (CPI)",
        country: "US",
        currency: "USD",
        impact: "high",
        forecast: null,
        previous: null,
      })
    }

    console.log("[v0] Economic events detected:", events.length)
    return events
  } catch (error) {
    console.error("[v0] Error fetching economic events:", error)
    return []
  }
}

function calculateConfidenceAdjustment(events: EconomicEvent[]): number {
  const highImpactWithin1Hour = events.some((event) => event.impact === "high" && isWithinHours(event.time, 1))

  const highImpactWithin4Hours = events.some((event) => event.impact === "high" && isWithinHours(event.time, 4))

  if (highImpactWithin1Hour) return -50 // Severely reduce confidence
  if (highImpactWithin4Hours) return -20 // Moderately reduce confidence
  return 0
}

export function assessVolatilityRegime(atr: number, historicalATR: number[]): "low" | "normal" | "high" | "extreme" {
  if (historicalATR.length === 0) return "normal"

  const avg = historicalATR.reduce((sum, v) => sum + v, 0) / historicalATR.length
  const ratio = atr / avg

  if (ratio > 2.5) return "extreme"
  if (ratio > 1.5) return "high"
  if (ratio < 0.5) return "low"
  return "normal"
}

export function shouldAvoidTrading(context: MarketContext): { avoid: boolean; reason: string | null } {
  // Block trading during high-impact news within 1 hour
  const highImpactEvent = context.economicEvents.find(
    (event) => event.impact === "high" && isWithinHours(event.time, 1),
  )

  if (highImpactEvent) {
    return {
      avoid: true,
      reason: `High-impact event: ${highImpactEvent.event} at ${new Date(highImpactEvent.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    }
  }

  // Avoid extreme volatility regimes
  if (context.volatilityRegime === "extreme") {
    return {
      avoid: true,
      reason: "Extreme volatility detected - market too unstable",
    }
  }

  return { avoid: false, reason: null }
}

function isWithinHours(eventTime: string, hours: number): boolean {
  try {
    const eventDate = new Date(eventTime)
    const now = new Date()
    const diff = Math.abs(eventDate.getTime() - now.getTime())
    return diff < hours * 60 * 60 * 1000
  } catch {
    return false
  }
}
