const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args))

exports.handler = async (event, context) => {
  try {
    const { symbol, closes, ema8, ema21, macd, stoch_rsi, price, target_return } = event.queryStringParameters || {}

    // Check for API key
    const apiKey = process.env.HUGGINGFACE_API_KEY
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "HUGGINGFACE_API_KEY not set in Netlify environment variables",
          symbol,
          signal: "hold",
          confidence: 0,
        }),
      }
    }

    if (!symbol || !closes) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required parameters: symbol, closes" }),
      }
    }

    // Parse closes array
    let closesArray
    try {
      closesArray = JSON.parse(closes)
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid closes array format" }),
      }
    }

    // Calculate 3% return target
    const currentPrice = Number.parseFloat(price) || closesArray[closesArray.length - 1]
    const targetPrice = currentPrice * 1.03 // 3% return target
    const stopLoss = currentPrice * 0.98 // 2% stop loss

    // Prepare input for HF model
    const indicators = {
      ema8: Number.parseFloat(ema8) || 0,
      ema21: Number.parseFloat(ema21) || 0,
      macd: Number.parseFloat(macd) || 0,
      stoch_rsi: Number.parseFloat(stoch_rsi) || 0.5,
      price: currentPrice,
      target: targetPrice,
      stop: stopLoss,
    }

    // Create text input for classification
    const inputText = `Analyze ${symbol}: Price=${currentPrice.toFixed(2)}, EMA8=${indicators.ema8.toFixed(2)}, EMA21=${indicators.ema21.toFixed(2)}, MACD=${indicators.macd.toFixed(4)}, StochRSI=${indicators.stoch_rsi.toFixed(2)}, Target=3% return at ${targetPrice.toFixed(2)}`

    try {
      // Call Hugging Face Inference API
      const hfResponse = await fetch("https://api-inference.huggingface.co/models/ProsusAI/finbert", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: inputText,
          options: { wait_for_model: true },
        }),
      })

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text()
        console.error("HF API error:", errorText)

        // Return fallback based on technical indicators
        const signal = determineFallbackSignal(indicators)

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            signal,
            confidence: 0.5,
            target: targetPrice,
            stop: stopLoss,
            ts: new Date().toISOString(),
            note: "Using fallback technical analysis",
            hf_error: errorText.substring(0, 200),
          }),
        }
      }

      const hfData = await hfResponse.json()

      // Parse HF response
      let signal = "hold"
      let confidence = 0.5

      if (Array.isArray(hfData) && hfData[0]) {
        const results = hfData[0]

        // FinBERT returns positive/negative/neutral
        const positive = results.find((r) => r.label === "positive")?.score || 0
        const negative = results.find((r) => r.label === "negative")?.score || 0
        const neutral = results.find((r) => r.label === "neutral")?.score || 0

        // Combine with technical indicators for 3% return targeting
        const technicalBias = calculateTechnicalBias(indicators)

        // Weighted decision: 60% AI sentiment, 40% technical
        const combinedPositive = positive * 0.6 + (technicalBias > 0 ? technicalBias * 0.4 : 0)
        const combinedNegative = negative * 0.6 + (technicalBias < 0 ? Math.abs(technicalBias) * 0.4 : 0)

        if (combinedPositive > 0.6 && combinedPositive > combinedNegative) {
          signal = "long"
          confidence = combinedPositive
        } else if (combinedNegative > 0.6 && combinedNegative > combinedPositive) {
          signal = "short"
          confidence = combinedNegative
        } else {
          signal = "hold"
          confidence = neutral
        }
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          signal,
          confidence: confidence.toFixed(3),
          target: targetPrice.toFixed(2),
          stop: stopLoss.toFixed(2),
          expected_return: "3.00%",
          risk_reward: "1.5:1",
          ts: new Date().toISOString(),
        }),
      }
    } catch (hfError) {
      console.error("HF request error:", hfError)

      // Fallback to technical analysis
      const signal = determineFallbackSignal(indicators)

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          signal,
          confidence: 0.5,
          target: targetPrice,
          stop: stopLoss,
          ts: new Date().toISOString(),
          note: "Using technical analysis fallback",
        }),
      }
    }
  } catch (error) {
    console.error("Signal function error:", error)
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        signal: "hold",
        confidence: 0,
      }),
    }
  }
}

// Helper: Calculate technical bias for 3% return probability
function calculateTechnicalBias(indicators) {
  let score = 0

  // EMA trend (bullish if EMA8 > EMA21)
  if (indicators.ema8 > indicators.ema21) {
    score += 0.3
  } else if (indicators.ema8 < indicators.ema21) {
    score -= 0.3
  }

  // MACD (bullish if positive)
  if (indicators.macd > 0) {
    score += 0.25
  } else if (indicators.macd < 0) {
    score -= 0.25
  }

  // Stoch RSI (oversold/overbought)
  if (indicators.stoch_rsi < 0.2) {
    score += 0.25 // Oversold, potential bounce
  } else if (indicators.stoch_rsi > 0.8) {
    score -= 0.25 // Overbought, potential drop
  }

  // Momentum check
  if (indicators.stoch_rsi > 0.5 && indicators.macd > 0 && indicators.ema8 > indicators.ema21) {
    score += 0.2 // Strong bullish momentum
  }

  return score
}

// Helper: Determine fallback signal
function determineFallbackSignal(indicators) {
  const bias = calculateTechnicalBias(indicators)

  if (bias > 0.4) return "long"
  if (bias < -0.4) return "short"
  return "hold"
}
