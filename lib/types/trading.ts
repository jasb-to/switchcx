// Core trading types for the XAUUSD system

export type Timeframe = "5m" | "15m" | "1h" | "4h"
export type TradingSession = "london" | "new_york" | "overlap" | "asian"
export type Direction = "bullish" | "bearish" | "ranging"
export type SignalStatus = "active" | "closed" | "invalidated"

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TimeframeData {
  timeframe: Timeframe
  candles: Candle[]
  lastUpdated: number
}

export interface BreakoutZone {
  level: number
  type: "resistance" | "support"
  strength: number
  touches: number
}

export interface ChandelierExit {
  stopLoss: number
  atrMultiplier: number
  atrValue: number
  highestHigh?: number
  lowestLow?: number
}

export interface VolatilityMetrics {
  atr: number
  rangeExpansion: boolean
  rangeCompression: boolean
  volatilityScore: number
}

export interface TimeframeScore {
  timeframe: Timeframe
  score: number
  maxScore: number
  criteria: {
    adx: boolean
    volume: boolean
    emaAlignment: boolean
    trendDirection: boolean
    volatility: boolean
  }
  adxValue?: number
}

export interface TradingSignal {
  id: string
  timestamp: number
  direction: Direction
  entryPrice: number
  stopLoss: number
  takeProfit?: number
  chandelierStop: number
  status: SignalStatus
  breakoutZone: BreakoutZone
  volatility: VolatilityMetrics
  timeframeScores: TimeframeScore[]
  session: TradingSession
  reason?: string
  exitPrice?: number
  exitTimestamp?: number
  pnl?: number
}

export interface RiskManagement {
  maxRiskPerTrade: number
  maxTradesPerSession: number
  consecutiveLosses: number
  lockoutThreshold: number
  isLockedOut: boolean
  currentSessionTrades: number
}

export interface MarketState {
  currentPrice: number
  currentSession: TradingSession
  trend4h: Direction
  trend1h: Direction
  isChopRange: boolean
  volatilityFilter: boolean
  activeSignal?: TradingSignal
  lastUpdate: number
}
