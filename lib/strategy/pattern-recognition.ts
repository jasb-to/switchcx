// Advanced candle pattern recognition for additional signal confirmation

import type { Candle } from "../types/trading"

export interface CandlePattern {
  name: string
  type: "bullish" | "bearish" | "indecision"
  strength: number // 0-100
  index: number
  description: string
}

// Calculate candle body and shadow sizes
function getCandleMetrics(candle: Candle) {
  const body = Math.abs(candle.close - candle.open)
  const upperShadow = candle.high - Math.max(candle.open, candle.close)
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low
  const totalRange = candle.high - candle.low
  const isBullish = candle.close > candle.open
  const isBearish = candle.close < candle.open

  return {
    body,
    upperShadow,
    lowerShadow,
    totalRange,
    bodyPercent: totalRange > 0 ? (body / totalRange) * 100 : 0,
    isBullish,
    isBearish,
  }
}

// Hammer (bullish reversal)
function detectHammer(candle: Candle, prevCandles: Candle[]): CandlePattern | null {
  const metrics = getCandleMetrics(candle)

  // Hammer criteria: small body at top, long lower shadow, small/no upper shadow
  const isHammer =
    metrics.bodyPercent < 30 &&
    metrics.lowerShadow > metrics.body * 2 &&
    metrics.upperShadow < metrics.body * 0.5 &&
    metrics.totalRange > 0

  if (!isHammer) return null

  // Check for downtrend context (last 3 candles should be bearish)
  const bearishContext = prevCandles.slice(-3).filter((c) => c.close < c.open).length >= 2

  return {
    name: "Hammer",
    type: "bullish",
    strength: bearishContext ? 80 : 60,
    index: prevCandles.length,
    description: "Bullish reversal - Long lower shadow indicates buying pressure",
  }
}

// Shooting Star (bearish reversal)
function detectShootingStar(candle: Candle, prevCandles: Candle[]): CandlePattern | null {
  const metrics = getCandleMetrics(candle)

  // Shooting star criteria: small body at bottom, long upper shadow, small/no lower shadow
  const isShootingStar =
    metrics.bodyPercent < 30 &&
    metrics.upperShadow > metrics.body * 2 &&
    metrics.lowerShadow < metrics.body * 0.5 &&
    metrics.totalRange > 0

  if (!isShootingStar) return null

  // Check for uptrend context
  const bullishContext = prevCandles.slice(-3).filter((c) => c.close > c.open).length >= 2

  return {
    name: "Shooting Star",
    type: "bearish",
    strength: bullishContext ? 80 : 60,
    index: prevCandles.length,
    description: "Bearish reversal - Long upper shadow indicates selling pressure",
  }
}

// Bullish Engulfing
function detectBullishEngulfing(candle: Candle, prevCandle: Candle, prevCandles: Candle[]): CandlePattern | null {
  const currentMetrics = getCandleMetrics(candle)
  const prevMetrics = getCandleMetrics(prevCandle)

  // Engulfing criteria: current bullish candle completely engulfs previous bearish candle
  const isEngulfing =
    currentMetrics.isBullish &&
    prevMetrics.isBearish &&
    candle.open <= prevCandle.close &&
    candle.close >= prevCandle.open &&
    currentMetrics.body > prevMetrics.body

  if (!isEngulfing) return null

  // Check for downtrend context
  const bearishContext = prevCandles.slice(-4, -1).filter((c) => c.close < c.open).length >= 2

  return {
    name: "Bullish Engulfing",
    type: "bullish",
    strength: bearishContext ? 85 : 70,
    index: prevCandles.length,
    description: "Strong bullish reversal - Buyers overwhelm sellers",
  }
}

// Bearish Engulfing
function detectBearishEngulfing(candle: Candle, prevCandle: Candle, prevCandles: Candle[]): CandlePattern | null {
  const currentMetrics = getCandleMetrics(candle)
  const prevMetrics = getCandleMetrics(prevCandle)

  // Engulfing criteria: current bearish candle completely engulfs previous bullish candle
  const isEngulfing =
    currentMetrics.isBearish &&
    prevMetrics.isBullish &&
    candle.open >= prevCandle.close &&
    candle.close <= prevCandle.open &&
    currentMetrics.body > prevMetrics.body

  if (!isEngulfing) return null

  // Check for uptrend context
  const bullishContext = prevCandles.slice(-4, -1).filter((c) => c.close > c.open).length >= 2

  return {
    name: "Bearish Engulfing",
    type: "bearish",
    strength: bullishContext ? 85 : 70,
    index: prevCandles.length,
    description: "Strong bearish reversal - Sellers overwhelm buyers",
  }
}

// Doji (indecision)
function detectDoji(candle: Candle): CandlePattern | null {
  const metrics = getCandleMetrics(candle)

  // Doji criteria: very small body relative to total range
  const isDoji = metrics.bodyPercent < 5 && metrics.totalRange > 0

  if (!isDoji) return null

  return {
    name: "Doji",
    type: "indecision",
    strength: 75,
    index: 0,
    description: "Market indecision - Potential reversal or continuation",
  }
}

// Three White Soldiers (bullish continuation)
function detectThreeWhiteSoldiers(candles: Candle[], prevCandles: Candle[]): CandlePattern | null {
  if (candles.length < 3) return null

  const [c1, c2, c3] = candles.slice(-3)
  const m1 = getCandleMetrics(c1)
  const m2 = getCandleMetrics(c2)
  const m3 = getCandleMetrics(c3)

  // Three white soldiers: 3 consecutive bullish candles, each closing higher
  const isPattern =
    m1.isBullish &&
    m2.isBullish &&
    m3.isBullish &&
    c2.close > c1.close &&
    c3.close > c2.close &&
    c2.open > c1.open &&
    c2.open < c1.close &&
    c3.open > c2.open &&
    c3.open < c2.close &&
    m1.bodyPercent > 60 &&
    m2.bodyPercent > 60 &&
    m3.bodyPercent > 60

  if (!isPattern) return null

  return {
    name: "Three White Soldiers",
    type: "bullish",
    strength: 90,
    index: prevCandles.length - 3,
    description: "Strong bullish continuation - Sustained buying pressure",
  }
}

// Three Black Crows (bearish continuation)
function detectThreeBlackCrows(candles: Candle[], prevCandles: Candle[]): CandlePattern | null {
  if (candles.length < 3) return null

  const [c1, c2, c3] = candles.slice(-3)
  const m1 = getCandleMetrics(c1)
  const m2 = getCandleMetrics(c2)
  const m3 = getCandleMetrics(c3)

  // Three black crows: 3 consecutive bearish candles, each closing lower
  const isPattern =
    m1.isBearish &&
    m1.bodyPercent > 60 &&
    m2.bodyPercent < 30 &&
    m3.isBearish &&
    m3.bodyPercent > 60 &&
    c2.close < c1.close &&
    c3.close < c2.close &&
    c2.open < c1.open &&
    c2.open > c1.close &&
    c3.open < c2.open &&
    c3.open > c2.close

  if (!isPattern) return null

  return {
    name: "Three Black Crows",
    type: "bearish",
    strength: 90,
    index: prevCandles.length - 3,
    description: "Strong bearish continuation - Sustained selling pressure",
  }
}

// Morning Star (bullish reversal)
function detectMorningStar(candles: Candle[], prevCandles: Candle[]): CandlePattern | null {
  if (candles.length < 3) return null

  const [c1, c2, c3] = candles.slice(-3)
  const m1 = getCandleMetrics(c1)
  const m2 = getCandleMetrics(c2)
  const m3 = getCandleMetrics(c3)

  // Morning star: bearish candle, small candle (doji/spinning top), bullish candle
  const isPattern =
    m1.isBearish &&
    m1.bodyPercent > 60 &&
    m2.bodyPercent < 30 &&
    m3.isBullish &&
    m3.bodyPercent > 60 &&
    c3.close > (c1.open + c1.close) / 2

  if (!isPattern) return null

  // Check for downtrend context
  const bearishContext = prevCandles.slice(-5, -3).filter((c) => c.close < c.open).length >= 2

  return {
    name: "Morning Star",
    type: "bullish",
    strength: bearishContext ? 88 : 70,
    index: prevCandles.length - 3,
    description: "Bullish reversal pattern - Downtrend exhaustion",
  }
}

// Evening Star (bearish reversal)
function detectEveningStar(candles: Candle[], prevCandles: Candle[]): CandlePattern | null {
  if (candles.length < 3) return null

  const [c1, c2, c3] = candles.slice(-3)
  const m1 = getCandleMetrics(c1)
  const m2 = getCandleMetrics(c2)
  const m3 = getCandleMetrics(c3)

  // Evening star: bullish candle, small candle (doji/spinning top), bearish candle
  const isPattern =
    m1.isBullish &&
    m1.bodyPercent > 60 &&
    m2.bodyPercent < 30 &&
    m3.isBearish &&
    m3.bodyPercent > 60 &&
    c3.close < (c1.open + c1.close) / 2

  if (!isPattern) return null

  // Check for uptrend context
  const bullishContext = prevCandles.slice(-5, -3).filter((c) => c.close > c.open).length >= 2

  return {
    name: "Evening Star",
    type: "bearish",
    strength: bullishContext ? 88 : 70,
    index: prevCandles.length - 3,
    description: "Bearish reversal pattern - Uptrend exhaustion",
  }
}

// Main function to detect all patterns
export function detectCandlePatterns(candles: Candle[], lookback = 20): CandlePattern[] {
  if (candles.length < 3) return []

  const patterns: CandlePattern[] = []
  const recentCandles = candles.slice(-lookback)
  const lastCandle = recentCandles[recentCandles.length - 1]
  const prevCandle = recentCandles.length > 1 ? recentCandles[recentCandles.length - 2] : lastCandle

  // Single candle patterns
  const hammer = detectHammer(lastCandle, recentCandles)
  if (hammer) patterns.push(hammer)

  const shootingStar = detectShootingStar(lastCandle, recentCandles)
  if (shootingStar) patterns.push(shootingStar)

  const doji = detectDoji(lastCandle)
  if (doji) patterns.push(doji)

  // Two candle patterns
  if (recentCandles.length >= 2) {
    const bullishEngulfing = detectBullishEngulfing(lastCandle, prevCandle, recentCandles)
    if (bullishEngulfing) patterns.push(bullishEngulfing)

    const bearishEngulfing = detectBearishEngulfing(lastCandle, prevCandle, recentCandles)
    if (bearishEngulfing) patterns.push(bearishEngulfing)
  }

  // Three candle patterns
  if (recentCandles.length >= 3) {
    const threeWhiteSoldiers = detectThreeWhiteSoldiers(recentCandles, recentCandles)
    if (threeWhiteSoldiers) patterns.push(threeWhiteSoldiers)

    const threeBlackCrows = detectThreeBlackCrows(recentCandles, recentCandles)
    if (threeBlackCrows) patterns.push(threeBlackCrows)

    const morningStar = detectMorningStar(recentCandles, recentCandles)
    if (morningStar) patterns.push(morningStar)

    const eveningStar = detectEveningStar(recentCandles, recentCandles)
    if (eveningStar) patterns.push(eveningStar)
  }

  return patterns.sort((a, b) => b.strength - a.strength)
}

// Helper function to check if patterns support the breakout direction
export function patternsConfirmDirection(
  patterns: CandlePattern[],
  direction: "bullish" | "bearish",
): { confirmed: boolean; strength: number; supportingPatterns: CandlePattern[] } {
  const supportingPatterns = patterns.filter((p) => p.type === direction)

  if (supportingPatterns.length === 0) {
    return { confirmed: false, strength: 0, supportingPatterns: [] }
  }

  // Calculate average strength of supporting patterns
  const avgStrength = supportingPatterns.reduce((sum, p) => sum + p.strength, 0) / supportingPatterns.length

  // Confirmed if at least one strong pattern (>70) or multiple moderate patterns
  const confirmed = supportingPatterns.some((p) => p.strength > 70) || supportingPatterns.length >= 2

  return {
    confirmed,
    strength: avgStrength,
    supportingPatterns,
  }
}

export class PatternRecognizer {
  detectPatterns(candles: Candle[], lookback = 20): CandlePattern[] {
    return detectCandlePatterns(candles, lookback)
  }

  confirmsDirection(
    patterns: CandlePattern[],
    direction: "bullish" | "bearish",
  ): { confirmed: boolean; strength: number; supportingPatterns: CandlePattern[] } {
    return patternsConfirmDirection(patterns, direction)
  }
}
