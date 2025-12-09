// Breakout detection logic

import type { Candle, BreakoutZone, Direction } from "../types/trading"

export interface Trendline {
  slope: number
  intercept: number
  type: "ascending" | "descending"
  strength: number
  touches: number
  startIndex: number
  endIndex: number
}

export function detectTrendlines(candles: Candle[], lookback = 50): Trendline[] {
  if (candles.length < lookback) {
    return []
  }

  const recentCandles = candles.slice(-lookback)
  const trendlines: Trendline[] = []

  // Find descending trendlines (connect swing highs)
  const swingHighs: { index: number; price: number }[] = []
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const candle = recentCandles[i]
    if (
      candle.high > recentCandles[i - 1].high &&
      candle.high > recentCandles[i - 2].high &&
      candle.high > recentCandles[i + 1].high &&
      candle.high > recentCandles[i + 2].high
    ) {
      swingHighs.push({ index: i, price: candle.high })
    }
  }

  // Find ascending trendlines (connect swing lows)
  const swingLows: { index: number; price: number }[] = []
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const candle = recentCandles[i]
    if (
      candle.low < recentCandles[i - 1].low &&
      candle.low < recentCandles[i - 2].low &&
      candle.low < recentCandles[i + 1].low &&
      candle.low < recentCandles[i + 2].low
    ) {
      swingLows.push({ index: i, price: candle.low })
    }
  }

  // Create descending trendlines from swing highs
  if (swingHighs.length >= 2) {
    for (let i = 0; i < swingHighs.length - 1; i++) {
      for (let j = i + 1; j < swingHighs.length; j++) {
        const point1 = swingHighs[i]
        const point2 = swingHighs[j]

        const slope = (point2.price - point1.price) / (point2.index - point1.index)

        // Only descending trendlines (negative slope)
        if (slope < -0.1) {
          const intercept = point1.price - slope * point1.index

          // Count touches
          let touches = 2
          for (const swing of swingHighs) {
            if (swing.index !== point1.index && swing.index !== point2.index) {
              const expectedPrice = slope * swing.index + intercept
              if (Math.abs(swing.price - expectedPrice) / swing.price < 0.005) {
                touches++
              }
            }
          }

          if (touches >= 2) {
            trendlines.push({
              slope,
              intercept,
              type: "descending",
              strength: Math.min(100, touches * 25),
              touches,
              startIndex: point1.index,
              endIndex: point2.index,
            })
          }
        }
      }
    }
  }

  // Create ascending trendlines from swing lows
  if (swingLows.length >= 2) {
    for (let i = 0; i < swingLows.length - 1; i++) {
      for (let j = i + 1; j < swingLows.length; j++) {
        const point1 = swingLows[i]
        const point2 = swingLows[j]

        const slope = (point2.price - point1.price) / (point2.index - point1.index)

        // Only ascending trendlines (positive slope)
        if (slope > 0.1) {
          const intercept = point1.price - slope * point1.index

          // Count touches
          let touches = 2
          for (const swing of swingLows) {
            if (swing.index !== point1.index && swing.index !== point2.index) {
              const expectedPrice = slope * swing.index + intercept
              if (Math.abs(swing.price - expectedPrice) / swing.price < 0.005) {
                touches++
              }
            }
          }

          if (touches >= 2) {
            trendlines.push({
              slope,
              intercept,
              type: "ascending",
              strength: Math.min(100, touches * 25),
              touches,
              startIndex: point1.index,
              endIndex: point2.index,
            })
          }
        }
      }
    }
  }

  return trendlines.sort((a, b) => b.strength - a.strength).slice(0, 3)
}

export function checkTrendlineBreakout(
  currentPrice: number,
  candles: Candle[],
  trendlines: Trendline[],
): { isBreakout: boolean; direction: Direction; trendline?: Trendline } {
  if (trendlines.length === 0 || candles.length === 0) {
    return { isBreakout: false, direction: "ranging" }
  }

  const currentIndex = candles.length - 1
  const lastCandle = candles[candles.length - 1]

  for (const trendline of trendlines) {
    const expectedPrice = trendline.slope * currentIndex + trendline.intercept
    const previousExpectedPrice = trendline.slope * (currentIndex - 1) + trendline.intercept

    // Descending trendline breakout (bullish)
    if (trendline.type === "descending") {
      const wasBelow = lastCandle.close < previousExpectedPrice
      const isAbove = currentPrice > expectedPrice * 1.002 // 0.2% above trendline

      if (wasBelow && isAbove) {
        return {
          isBreakout: true,
          direction: "bullish",
          trendline,
        }
      }
    }

    // Ascending trendline breakdown (bearish)
    if (trendline.type === "ascending") {
      const wasAbove = lastCandle.close > previousExpectedPrice
      const isBelow = currentPrice < expectedPrice * 0.998 // 0.2% below trendline

      if (wasAbove && isBelow) {
        return {
          isBreakout: true,
          direction: "bearish",
          trendline,
        }
      }
    }
  }

  return { isBreakout: false, direction: "ranging" }
}

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
