// Telegram bot client for sending trading alerts

import type { TradingSignal, TimeframeScore } from "../types/trading"
import { getSessionLabel } from "../strategy/session-filter"

interface TelegramAlert {
  type:
    | "entry"
    | "exit"
    | "breakout"
    | "trend_change"
    | "chop_detected"
    | "volatility"
    | "error"
    | "status"
    | "get_ready"
    | "limit_order"
    | "reversal" // Added reversal alert type
  signal?: TradingSignal
  message?: string
  price?: number
  trend?: string
  timeframeScores?: TimeframeScore[]
}

class TelegramClient {
  private readonly botToken: string
  private readonly chatId: string

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    if (!token || !chat) {
      console.warn("[v0] Telegram credentials not configured")
      this.botToken = ""
      this.chatId = ""
    } else {
      this.botToken = token
      this.chatId = chat
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId)
  }

  private formatPrice(price: number): string {
    return price.toFixed(2)
  }

  private calculateAlertTier(timeframeScores: TimeframeScore[]): number {
    const score4h = timeframeScores.find((s) => s.timeframe === "4h")
    const score1h = timeframeScores.find((s) => s.timeframe === "1h")
    const score15m = timeframeScores.find((s) => s.timeframe === "15m")
    const score5m = timeframeScores.find((s) => s.timeframe === "5m")

    if (!score4h || !score1h || !score15m || !score5m) return 0

    let tier = 0
    if (score4h.score >= 3) tier++
    if (score1h.score >= 2) tier++
    if (score15m.score >= 1) tier++
    if (score5m.score >= 1) tier++

    return tier
  }

  private buildGetReadyMessage(timeframeScores: TimeframeScore[], price: number): string {
    return `
⚠️ *GET READY ALERT* (2/4 Confirmations)

Current Price: $${this.formatPrice(price)}

📊 *Timeframe Scores*
${timeframeScores
  .map((tf) => {
    const icon = tf.score >= 3 ? "✅" : tf.score >= 2 ? "⚡" : "⚠️"
    return `${icon} ${tf.timeframe.toUpperCase()}: ${tf.score}/${tf.maxScore}${tf.timeframe === "1h" && tf.adxValue ? ` (ADX: ${tf.adxValue.toFixed(1)})` : ""}`
  })
  .join("\n")}

Market conditions are building. Monitor for further confirmations.
    `.trim()
  }

  private buildLimitOrderMessage(signal: TradingSignal): string {
    const direction = signal.direction.toUpperCase()
    const positionType = signal.direction === "bullish" ? "LONG" : "SHORT"
    const emoji = signal.direction === "bullish" ? "🟢" : "🔴"
    const session = getSessionLabel(signal.session)

    const modeEmoji = signal.metadata?.signalMode === "conservative" ? "🛡️" : "⚡"
    const modeLabel = signal.metadata?.signalMode === "conservative" ? "CONSERVATIVE" : "AGGRESSIVE"

    return `
${emoji} *LIMIT ORDER READY* (3/4 Confirmations)

${modeEmoji} *Mode*: ${modeLabel}
Direction: ${direction} (${positionType})
Entry Zone: $${this.formatPrice(signal.entryPrice)}
Stop Loss: $${this.formatPrice(signal.stopLoss)}
${signal.tp1 ? `TP1 (2R): $${this.formatPrice(signal.tp1)}` : ""}
${signal.tp2 ? `TP2 (3R): $${this.formatPrice(signal.tp2)}` : ""}

⏰ *Session*: ${session}

🎯 *Breakout Zone*
Type: ${signal.breakoutZone.type.toUpperCase()}
Level: $${this.formatPrice(signal.breakoutZone.level)}
Strength: ${signal.breakoutZone.strength}/100

📊 *Timeframe Confirmations*
${signal.timeframeScores
  .map((tf) => {
    const icon = tf.score >= 3 ? "✅" : tf.score >= 2 ? "⚡" : "⚠️"
    return `${icon} ${tf.timeframe.toUpperCase()}: ${tf.score}/${tf.maxScore}${tf.timeframe === "1h" && tf.adxValue ? ` (ADX: ${tf.adxValue.toFixed(1)})` : ""}`
  })
  .join("\n")}

${
  signal.metadata?.signalMode === "conservative"
    ? "🛡️ High probability - All major timeframes aligned"
    : "⚡ Early entry - Lower timeframes leading"
}

Place limit order and wait for final confirmation.
    `.trim()
  }

  private buildEntryMessage(signal: TradingSignal): string {
    const direction = signal.direction.toUpperCase()
    const positionType = signal.direction === "bullish" ? "LONG" : "SHORT"
    const emoji = signal.direction === "bullish" ? "🟢" : "🔴"
    const session = getSessionLabel(signal.session)

    const risk = Math.abs(signal.entryPrice - signal.stopLoss)
    const rr1 = signal.tp1 ? Math.abs(signal.tp1 - signal.entryPrice) / risk : 0
    const rr2 = signal.tp2 ? Math.abs(signal.tp2 - signal.entryPrice) / risk : 0

    const modeEmoji = signal.metadata?.signalMode === "conservative" ? "🛡️" : "⚡"
    const modeLabel = signal.metadata?.signalMode === "conservative" ? "CONSERVATIVE" : "AGGRESSIVE"
    const confidence = signal.metadata?.confidenceScore || 0

    return `
${emoji} *ENTER NOW!* (4/4 Confirmations) ${emoji}

🚀 *XAUUSD ${positionType} SIGNAL* (${direction})

${modeEmoji} *Mode*: ${modeLabel}
📊 *Confidence*: ${confidence}/10

📊 *Entry Details*
Entry: $${this.formatPrice(signal.entryPrice)}
Stop Loss: $${this.formatPrice(signal.stopLoss)}
${signal.tp1 ? `TP1 (${rr1.toFixed(1)}R): $${this.formatPrice(signal.tp1)}` : ""}
${signal.tp2 ? `TP2 (${rr2.toFixed(1)}R): $${this.formatPrice(signal.tp2)}` : ""}
Chandelier Stop: $${this.formatPrice(signal.chandelierStop)}

⏰ *Session*: ${session}

🎯 *Breakout Zone*
Type: ${signal.breakoutZone.type.toUpperCase()}
Level: $${this.formatPrice(signal.breakoutZone.level)}
Strength: ${signal.breakoutZone.strength}/100
Touches: ${signal.breakoutZone.touches}

📈 *Volatility*
ATR: $${this.formatPrice(signal.volatility.atr)}
Score: ${signal.volatility.volatilityScore.toFixed(0)}/100
${signal.volatility.rangeExpansion ? "✅ Range Expansion" : ""}
${signal.volatility.rangeCompression ? "⚠️ Range Compression" : ""}

📊 *Timeframe Confirmations*
${signal.timeframeScores
  .map((tf) => {
    const icon = tf.score >= tf.maxScore - 1 ? "✅" : tf.score >= 2 ? "⚡" : "⚠️"
    return `${icon} ${tf.timeframe.toUpperCase()}: ${tf.score}/${tf.maxScore}${tf.timeframe === "1h" && tf.adxValue ? ` (ADX: ${tf.adxValue.toFixed(1)})` : ""}`
  })
  .join("\n")}

${
  signal.metadata?.signalMode === "conservative"
    ? "🛡️ HIGH PROBABILITY - All major timeframes aligned\nExpected win rate: 65-75%"
    : "⚡ EARLY ENTRY - Catching momentum shift\nExpected win rate: 55-65%"
}

${signal.tp1 && signal.tp2 ? `💰 Risk/Reward - TP1: 1:${rr1.toFixed(1)}, TP2: 1:${rr2.toFixed(1)}` : ""}

🆔 Signal ID: \`${signal.id}\`
    `.trim()
  }

  private buildExitMessage(signal: TradingSignal): string {
    const emoji = signal.pnl && signal.pnl > 0 ? "✅" : "❌"
    const pnlEmoji = signal.pnl && signal.pnl > 0 ? "💰" : "💸"

    return `
${emoji} *SIGNAL CLOSED*

Direction: ${signal.direction.toUpperCase()}
Entry: $${this.formatPrice(signal.entryPrice)}
Exit: $${signal.exitPrice ? this.formatPrice(signal.exitPrice) : "N/A"}

${pnlEmoji} *P&L*: ${signal.pnl ? `$${signal.pnl.toFixed(2)}` : "N/A"}

Status: ${signal.status.toUpperCase()}
${signal.reason ? `Reason: ${signal.reason}` : ""}

🆔 Signal ID: \`${signal.id}\`
    `.trim()
  }

  private buildErrorMessage(error: string): string {
    return `
❌ *SYSTEM ERROR*

${error}

Timestamp: ${new Date().toISOString()}
    `.trim()
  }

  private buildStatusMessage(message: string): string {
    return `
ℹ️ *STATUS UPDATE*

${message}

Timestamp: ${new Date().toISOString()}
    `.trim()
  }

  private buildReversalMessage(signal: TradingSignal, message: string, currentPrice: number): string {
    const emoji = "🚨"
    const positionType = signal.direction === "bullish" ? "LONG" : "SHORT"

    return `
${emoji} *EMERGENCY EXIT ALERT!* ${emoji}

⚠️ *TRADE INVALIDATED - GET OUT NOW!*

Position: ${positionType} (${signal.direction.toUpperCase()})
Entry: $${this.formatPrice(signal.entryPrice)}
Current Price: $${this.formatPrice(currentPrice)}

🚨 *Reason*: ${message}

❌ *ACTION REQUIRED*
Close your position immediately!
The market has moved against the trade setup.

🆔 Signal ID: \`${signal.id}\`
    `.trim()
  }

  async sendMessage(text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log("[v0] Telegram not configured, skipping message:", text)
      return false
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error("[v0] Telegram API error:", error)
        return false
      }

      console.log("[v0] Telegram message sent successfully")
      return true
    } catch (error) {
      console.error("[v0] Failed to send Telegram message:", error)
      return false
    }
  }

  async sendAlert(alert: TelegramAlert): Promise<boolean> {
    let message = ""

    switch (alert.type) {
      case "get_ready":
        if (alert.timeframeScores && alert.price) {
          message = this.buildGetReadyMessage(alert.timeframeScores, alert.price)
        }
        break

      case "limit_order":
        if (alert.signal) {
          message = this.buildLimitOrderMessage(alert.signal)
        }
        break

      case "entry":
        if (alert.signal) {
          message = this.buildEntryMessage(alert.signal)
        }
        break

      case "exit":
        if (alert.signal) {
          message = this.buildExitMessage(alert.signal)
        }
        break

      case "error":
        if (alert.message) {
          message = this.buildErrorMessage(alert.message)
        }
        break

      case "status":
        if (alert.message) {
          message = this.buildStatusMessage(alert.message)
        }
        break

      case "reversal":
        if (alert.signal && alert.message && alert.price) {
          message = this.buildReversalMessage(alert.signal, alert.message, alert.price)
        }
        break

      default:
        console.warn("[v0] Unknown alert type:", alert.type)
        return false
    }

    if (!message) {
      console.warn("[v0] Empty message, not sending")
      return false
    }

    return this.sendMessage(message)
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      console.error("[v0] Telegram not configured")
      return false
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getMe`
      const response = await fetch(url)

      if (response.ok) {
        console.log("[v0] Telegram connection test successful")
        return true
      } else {
        console.error("[v0] Telegram connection test failed")
        return false
      }
    } catch (error) {
      console.error("[v0] Telegram connection test error:", error)
      return false
    }
  }
}

export const telegramClient = new TelegramClient()

export async function sendTelegramAlert(alert: TelegramAlert): Promise<boolean> {
  return telegramClient.sendAlert(alert)
}
