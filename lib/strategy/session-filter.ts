// Trading session detection and filtering

import type { TradingSession } from "../types/trading"

export function getCurrentSession(): TradingSession {
  const now = new Date()
  const utcHour = now.getUTCHours()
  const utcMinute = now.getUTCMinutes()
  const totalMinutes = utcHour * 60 + utcMinute

  // London: 08:00 - 17:00 UTC (480 - 1020 minutes)
  // New York: 13:00 - 22:00 UTC (780 - 1320 minutes)
  // Overlap: 13:00 - 17:00 UTC (780 - 1020 minutes)
  // Asian: 00:00 - 08:00 UTC (0 - 480 minutes)

  if (totalMinutes >= 780 && totalMinutes < 1020) {
    return "overlap"
  }

  if (totalMinutes >= 480 && totalMinutes < 780) {
    return "london"
  }

  if (totalMinutes >= 1020 && totalMinutes < 1320) {
    return "new_york"
  }

  return "asian"
}

export function shouldTradeInSession(
  session: TradingSession,
  volatilityScore: number,
  minVolatilityForAsian = 20, // Reduced from 25 to 20 to allow tier 3 signals during low volatility
): boolean {
  if (session === "london" || session === "new_york" || session === "overlap") {
    return true
  }

  if (session === "asian") {
    return volatilityScore >= minVolatilityForAsian
  }

  return false
}

export function getSessionLabel(session: TradingSession): string {
  const labels: Record<TradingSession, string> = {
    london: "London",
    new_york: "New York",
    overlap: "London/NY Overlap",
    asian: "Asian",
  }
  return labels[session]
}
