// Technical indicators for the trading strategy

import type { Candle } from "../types/trading"

export function calculateSMA(candles: Candle[], period: number): number[] {
  const sma: number[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      sma.push(Number.NaN)
      continue
    }

    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close
    }
    sma.push(sum / period)
  }

  return sma
}

export function calculateEMA(candles: Candle[], period: number): number[] {
  const ema: number[] = []
  const multiplier = 2 / (period + 1)

  // Start with SMA for first value
  let sum = 0
  for (let i = 0; i < period && i < candles.length; i++) {
    sum += candles[i].close
  }

  if (candles.length < period) {
    return candles.map(() => Number.NaN)
  }

  ema[period - 1] = sum / period

  // Calculate EMA for remaining values
  for (let i = period; i < candles.length; i++) {
    ema[i] = (candles[i].close - ema[i - 1]) * multiplier + ema[i - 1]
  }

  // Fill beginning with NaN
  for (let i = 0; i < period - 1; i++) {
    ema[i] = Number.NaN
  }

  return ema
}

export function calculateATR(candles: Candle[], period = 14): number[] {
  const atr: number[] = []
  const trueRanges: number[] = []

  // Calculate True Range for each candle
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low)
      continue
    }

    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))

    trueRanges.push(tr)
  }

  // Calculate ATR using EMA of True Ranges
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      atr.push(Number.NaN)
      continue
    }

    if (i === period - 1) {
      // First ATR is simple average
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += trueRanges[i - j]
      }
      atr.push(sum / period)
    } else {
      // Subsequent ATR values use smoothing
      atr.push((atr[i - 1] * (period - 1) + trueRanges[i]) / period)
    }
  }

  return atr
}

export function calculateADX(candles: Candle[], period = 14): number[] {
  const adx: number[] = []
  const plusDM: number[] = []
  const minusDM: number[] = []

  // Calculate directional movements
  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high
    const lowDiff = candles[i - 1].low - candles[i].low

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)
  }

  // Get ATR
  const atr = calculateATR(candles, period)

  // Calculate smoothed DI
  const plusDI: number[] = []
  const minusDI: number[] = []

  for (let i = 0; i < plusDM.length; i++) {
    if (i < period - 1 || isNaN(atr[i + 1])) {
      plusDI.push(Number.NaN)
      minusDI.push(Number.NaN)
      continue
    }

    const smoothedPlusDM =
      i === period - 1
        ? plusDM.slice(0, period).reduce((a, b) => a + b, 0)
        : (plusDI[i - 1] * atr[i] * (period - 1)) / 100 / period + plusDM[i]

    const smoothedMinusDM =
      i === period - 1
        ? minusDM.slice(0, period).reduce((a, b) => a + b, 0)
        : (minusDI[i - 1] * atr[i] * (period - 1)) / 100 / period + minusDM[i]

    plusDI.push((smoothedPlusDM / atr[i + 1]) * 100)
    minusDI.push((smoothedMinusDM / atr[i + 1]) * 100)
  }

  // Calculate DX and ADX
  const dx: number[] = []
  for (let i = 0; i < plusDI.length; i++) {
    if (isNaN(plusDI[i]) || isNaN(minusDI[i])) {
      dx.push(Number.NaN)
      continue
    }

    const diSum = plusDI[i] + minusDI[i]
    if (diSum === 0) {
      dx.push(0)
    } else {
      dx.push((Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100)
    }
  }

  for (let i = 0; i < dx.length; i++) {
    if (i < period * 2 - 1) {
      adx.push(Number.NaN)
      continue
    }

    if (i === period * 2 - 1) {
      // First ADX is average of first 'period' DX values
      const validDx = dx.slice(period - 1, period * 2 - 1).filter((v) => !isNaN(v))
      if (validDx.length === 0) {
        adx.push(Number.NaN)
      } else {
        const sum = validDx.reduce((a, b) => a + b, 0)
        adx.push(sum / validDx.length)
      }
    } else {
      // Subsequent ADX values use smoothing
      adx.push((adx[i - 1] * (period - 1) + dx[i]) / period)
    }
  }

  return adx
}

export function calculateChandelierExit(
  candles: Candle[],
  period = 22,
  atrMultiplier = 3,
): { stopLong: number[]; stopShort: number[] } {
  const atr = calculateATR(candles, period)
  const stopLong: number[] = []
  const stopShort: number[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1 || isNaN(atr[i])) {
      stopLong.push(Number.NaN)
      stopShort.push(Number.NaN)
      continue
    }

    // Find highest high and lowest low in period
    let highestHigh = candles[i].high
    let lowestLow = candles[i].low

    for (let j = 0; j < period && i - j >= 0; j++) {
      highestHigh = Math.max(highestHigh, candles[i - j].high)
      lowestLow = Math.min(lowestLow, candles[i - j].low)
    }

    stopLong.push(highestHigh - atrMultiplier * atr[i])
    stopShort.push(lowestLow + atrMultiplier * atr[i])
  }

  return { stopLong, stopShort }
}

export function detectVolatilityState(
  candles: Candle[],
  atrPeriod = 14,
  lookback = 50,
): { expansion: boolean; compression: boolean; score: number } {
  const atr = calculateATR(candles, atrPeriod)
  const latestATR = atr[atr.length - 1]

  if (isNaN(latestATR) || candles.length < lookback) {
    return { expansion: false, compression: false, score: 0 }
  }

  // Calculate average ATR over lookback period
  const recentATRs = atr.slice(-lookback).filter((v) => !isNaN(v))
  const avgATR = recentATRs.reduce((sum, c) => sum + c, 0) / recentATRs.length

  const ratio = latestATR / avgATR

  // Expansion: current ATR > 1.5x average
  // Compression: current ATR < 0.7x average
  const expansion = ratio > 1.5
  const compression = ratio < 0.7

  // Score from 0-100
  const score = Math.min(100, Math.max(0, (ratio - 0.5) * 50))

  return { expansion, compression, score }
}

export function calculateVolume(candles: Candle[], period = 20): number {
  if (candles.length < period) {
    return 0
  }

  const recentCandles = candles.slice(-period)
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / period

  return avgVolume
}
