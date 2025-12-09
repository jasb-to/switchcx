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
  trendDirection?: Direction
  chandelierLong?: number
  chandelierShort?: number
}

export interface TradingSignal {
  id: string
  timestamp: number
  direction: Direction
  entryPrice: number
  stopLoss: number
  takeProfit?: number
  tp1?: number
  tp2?: number
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
  metadata?: {
    rejectionReason?: string
    warning?: string
  }
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

export interface TradeHistory {
  id: string
  signal: TradingSignal
  entryTime: number
  entryPrice: number
  exitTime?: number
  exitPrice?: number
  exitReason?: "tp1" | "tp2" | "stop_loss" | "reversal" | "manual" | "chandelier"
  pnl?: number
  pnlPercent?: number
  rMultiple?: number
  duration?: number
  maxDrawdown?: number
  maxProfit?: number
}

export interface PerformanceMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  avgRMultiple: number
  maxDrawdown: number
  totalPnl: number
  bestTrade: number
  worstTrade: number
  avgHoldTime: number
  sharpeRatio: number
}

export interface MarketContext {
  dxyStrength: "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish"
  economicEvents: EconomicEvent[]
  correlationScore: number
  volatilityRegime: "low" | "normal" | "high" | "extreme"
  confidenceAdjustment: number
}

export interface EconomicEvent {
  time: string
  currency: string
  event: string
  impact: "low" | "medium" | "high"
  forecast?: string
  previous?: string
}

export interface SignalConfidence {
  score: number
  factors: {
    breakoutQuality: number
    volumeSurge: number
    timeframeAlignment: number
    marketContext: number
    historicalSuccess: number
  }
  recommendation: "strong_buy" | "buy" | "hold" | "avoid"
}

export interface TradeManagement {
  tp1Hit: boolean
  tp2Hit: boolean
  breakEvenSet: boolean
  trailingStopActive: boolean
  partialCloseAt: number[]
  currentStopLoss: number
}
