// Breakout detection logic

import type { Candle, BreakoutZone, Direction } from "../types/trading"

export function detectBreakoutZones(candles: Candle[], lookback = 50): BreakoutZone[] {
  if (candles.length < lookback) {
    return []
  }

  const recentCandles = candles.slice(-lookback)
  const zones: BreakoutZone[] = []

  // Find significant highs and lows
  const highs: { level: number; touches: number }[] = []
  const lows: { level: number; touches: number }[] = []

  // Identify swing highs and lows
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const candle = recentCandles[i]

    // Swing high
    if (
      candle.high > recentCandles[i - 1].high &&
      candle.high > recentCandles[i - 2].high &&
      candle.high > recentCandles[i + 1].high &&
      candle.high > recentCandles[i + 2].high
    ) {
      highs.push({ level: candle.high, touches: 1 })
    }

    // Swing low
    if (
      candle.low < recentCandles[i - 1].low &&
      candle.low < recentCandles[i - 2].low &&
      candle.low < recentCandles[i + 1].low &&
      candle.low < recentCandles[i + 2].low
    ) {
      lows.push({ level: candle.low, touches: 1 })
    }
  }

  // Cluster nearby levels
  const tolerance = 0.001 // 0.1% tolerance

  const clusterLevels = (levels: { level: number; touches: number }[]) => {
    const clustered: { level: number; touches: number }[] = []

    levels.forEach((current) => {
      const existing = clustered.find((c) => Math.abs(c.level - current.level) / current.level < tolerance)

      if (existing) {
        existing.touches++
        existing.level = (existing.level + current.level) / 2
      } else {
        clustered.push({ ...current })
      }
    })

    return clustered
  }

  const clusteredHighs = clusterLevels(highs)
  const clusteredLows = clusterLevels(lows)

  // Convert to breakout zones
  clusteredHighs.forEach((h) => {
    zones.push({
      level: h.level,
      type: "resistance",
      strength: Math.min(100, h.touches * 20),
      touches: h.touches,
    })
  })

  clusteredLows.forEach((l) => {
    zones.push({
      level: l.level,
      type: "support",
      strength: Math.min(100, l.touches * 20),
      touches: l.touches,
    })
  })

  // Sort by strength
  return zones.sort((a, b) => b.strength - a.strength).slice(0, 5)
}

export function checkBreakout(
  currentPrice: number,
  previousCandles: Candle[],
  zones: BreakoutZone[],
  sensitivity = 0.0002, // 0.02% tolerance for near-breakout
): { isBreakout: boolean; direction: Direction; zone?: BreakoutZone } {
  if (zones.length === 0 || previousCandles.length === 0) {
    return { isBreakout: false, direction: "ranging" }
  }

  const lastCandle = previousCandles[previousCandles.length - 1]

  // Check for resistance breakout (bullish)
  for (const zone of zones) {
    if (zone.type === "resistance") {
      const isNearOrAbove = currentPrice >= zone.level * (1 - sensitivity)
      const wasBelow = lastCandle.close < zone.level

      if (wasBelow && isNearOrAbove && zone.touches >= 2) {
        return {
          isBreakout: true,
          direction: "bullish",
          zone,
        }
      }
    }

    // Check for support breakdown (bearish)
    if (zone.type === "support") {
      const isNearOrBelow = currentPrice <= zone.level * (1 + sensitivity)
      const wasAbove = lastCandle.close > zone.level

      if (wasAbove && isNearOrBelow && zone.touches >= 2) {
        return {
          isBreakout: true,
          direction: "bearish",
          zone,
        }
      }
    }
  }

  return { isBreakout: false, direction: "ranging" }
}

export function validateBreakoutWithVolume(candles: Candle[], avgVolumePeriod = 20): boolean {
  if (candles.length < avgVolumePeriod + 1) {
    return false
  }

  const lastCandle = candles[candles.length - 1]
  const previousCandles = candles.slice(-(avgVolumePeriod + 1), -1)

  const avgVolume = previousCandles.reduce((sum, c) => sum + c.volume, 0) / avgVolumePeriod

  return lastCandle.volume >= avgVolume * 1.2
}
