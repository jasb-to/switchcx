// EMA calculation
export function ema(prices, period) {
  if (!prices || prices.length < period) return []

  const k = 2 / (period + 1)
  const emaArray = [prices[0]]

  for (let i = 1; i < prices.length; i++) {
    const emaValue = prices[i] * k + emaArray[i - 1] * (1 - k)
    emaArray.push(emaValue)
  }

  return emaArray
}

// MACD calculation
export function macd(prices, fast = 12, slow = 26, signal = 9) {
  if (!prices || prices.length < slow) {
    return { macdLine: [], signalLine: [], hist: [] }
  }

  const emaFast = ema(prices, fast)
  const emaSlow = ema(prices, slow)

  const macdLine = emaFast.map((val, i) => val - emaSlow[i])
  const signalLine = ema(macdLine, signal)
  const hist = macdLine.map((val, i) => val - (signalLine[i] || 0))

  return { macdLine, signalLine, hist }
}

// Stochastic RSI calculation
export function stochRsi(prices, period = 14) {
  if (!prices || prices.length < period) return []

  const rsiValues = calculateRSI(prices, period)
  const stochRsiArray = []

  for (let i = period - 1; i < rsiValues.length; i++) {
    const rsiSlice = rsiValues.slice(i - period + 1, i + 1)
    const minRsi = Math.min(...rsiSlice)
    const maxRsi = Math.max(...rsiSlice)

    const stochRsiValue = maxRsi === minRsi ? 0 : (rsiValues[i] - minRsi) / (maxRsi - minRsi)
    stochRsiArray.push(stochRsiValue)
  }

  return stochRsiArray
}

// Helper: Calculate RSI
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return []

  const changes = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }

  const rsiArray = []

  for (let i = period - 1; i < changes.length; i++) {
    const slice = changes.slice(i - period + 1, i + 1)
    const gains = slice.filter((c) => c > 0)
    const losses = slice.filter((c) => c < 0).map(Math.abs)

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    const rsi = 100 - 100 / (1 + rs)

    rsiArray.push(rsi)
  }

  return rsiArray
}

// Trendline break detection
export function trendlineBreak(closes, lookback = 20) {
  if (!closes || closes.length < lookback) return "neutral"

  const recent = closes.slice(-lookback)
  const firstHalf = recent.slice(0, lookback / 2)
  const secondHalf = recent.slice(lookback / 2)

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

  const change = (avgSecond - avgFirst) / avgFirst

  if (change > 0.03) return "bullish"
  if (change < -0.03) return "bearish"
  return "neutral"
}

// Support/Resistance detection
export function supportResistance(closes, lookback = 20, threshold = 0.005) {
  if (!closes || closes.length < lookback) return "neutral"

  const recent = closes.slice(-lookback)
  const currentPrice = closes[closes.length - 1]

  const highs = []
  const lows = []

  for (let i = 1; i < recent.length - 1; i++) {
    if (recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) {
      highs.push(recent[i])
    }
    if (recent[i] < recent[i - 1] && recent[i] < recent[i + 1]) {
      lows.push(recent[i])
    }
  }

  // Check if near support (potential long)
  for (const low of lows) {
    if (Math.abs(currentPrice - low) / low < threshold) {
      return "support"
    }
  }

  // Check if near resistance (potential short)
  for (const high of highs) {
    if (Math.abs(currentPrice - high) / high < threshold) {
      return "resistance"
    }
  }

  return "neutral"
}

// Stoch signal interpretation
export function stochSignal(value) {
  if (value < 0.2) return "oversold"
  if (value > 0.8) return "overbought"
  return "neutral"
}

// Combined signal logic with 3% return targeting
export function generateTradeSignal(indicators, price) {
  const { ema8, ema21, macdValue, stochRsiValue, trendline, sr } = indicators

  let score = 0
  const reasons = []

  // Priority 1: Trendline break (highest weight)
  if (trendline === "bullish") {
    score += 3
    reasons.push("Bullish trendline break")
  } else if (trendline === "bearish") {
    score -= 3
    reasons.push("Bearish trendline break")
  }

  // Priority 2: Support/Resistance
  if (sr === "support") {
    score += 2
    reasons.push("Near support level")
  } else if (sr === "resistance") {
    score -= 2
    reasons.push("Near resistance level")
  }

  // Priority 3: Stoch RSI
  if (stochRsiValue < 0.2) {
    score += 2
    reasons.push("Oversold (StochRSI)")
  } else if (stochRsiValue > 0.8) {
    score -= 2
    reasons.push("Overbought (StochRSI)")
  }

  // EMA trend
  if (ema8 > ema21) {
    score += 1
    reasons.push("EMA8 > EMA21")
  } else if (ema8 < ema21) {
    score -= 1
    reasons.push("EMA8 < EMA21")
  }

  // MACD
  if (macdValue > 0) {
    score += 1
    reasons.push("Positive MACD")
  } else if (macdValue < 0) {
    score -= 1
    reasons.push("Negative MACD")
  }

  // Calculate 3% target and stop loss
  const target = price * 1.03
  const stop = price * 0.98

  // Determine signal
  let signal = "hold"
  if (score >= 4) {
    signal = "long"
  } else if (score <= -4) {
    signal = "short"
  }

  return {
    signal,
    score,
    reasons,
    target: target.toFixed(2),
    stop: stop.toFixed(2),
    expectedReturn: "3.00%",
    riskReward: "1.5:1",
  }
}
