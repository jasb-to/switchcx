// Unified tier calculation logic used by both dashboard and cron job

import type { Direction, TimeframeScore } from "../types/trading"

export interface TierResult {
  tier: number
  mode: "conservative" | "aggressive" | "none"
  debugInfo: {
    strongTimeframes: number
    partialAlignment: boolean
    fullAlignment: boolean
    conservativeMode: boolean
    aggressiveMode: boolean
    conservative5mOpposing: boolean
  }
}

export function calculateConfirmationTier(
  timeframeScores: TimeframeScore[],
  trend4h: Direction,
  trend1h: Direction,
  trend15m: Direction,
  trend5m: Direction,
): TierResult {
  const score4h = timeframeScores.find((s) => s.timeframe === "4h")
  const score1h = timeframeScores.find((s) => s.timeframe === "1h")
  const score15m = timeframeScores.find((s) => s.timeframe === "15m")
  const score5m = timeframeScores.find((s) => s.timeframe === "5m")

  if (!score4h || !score1h || !score15m || !score5m) {
    return {
      tier: 0,
      mode: "none",
      debugInfo: {
        strongTimeframes: 0,
        partialAlignment: false,
        fullAlignment: false,
        conservativeMode: false,
        aggressiveMode: false,
        conservative5mOpposing: false,
      },
    }
  }

  const conservativeMode = trend4h === trend1h && trend4h !== "ranging" && trend1h !== "ranging"

  const conservative5mOpposing =
    conservativeMode &&
    ((trend4h === "bullish" && trend5m === "bearish") || (trend4h === "bearish" && trend5m === "bullish"))

  const aggressiveMode =
    trend1h !== "ranging" &&
    trend15m !== "ranging" &&
    trend5m !== "ranging" &&
    trend1h === trend15m &&
    trend1h === trend5m

  const strongTimeframes = [score4h.score >= 3, score1h.score >= 2, score15m.score >= 2, score5m.score >= 2].filter(
    Boolean,
  ).length

  // Tier 1: At least 2 strong timeframes
  if (strongTimeframes >= 2) {
    const partialAlignment =
      (trend1h === trend15m && trend1h !== "ranging") ||
      (trend15m === trend5m && trend15m !== "ranging") ||
      (trend4h === trend1h && trend4h !== "ranging")

    // Tier 2: Partial alignment + strong timeframes
    if (partialAlignment && strongTimeframes >= 2) {
      // Tier 3-4: Full alignment check
      if (aggressiveMode && strongTimeframes >= 3) {
        return {
          tier: 3,
          mode: "aggressive",
          debugInfo: {
            strongTimeframes,
            partialAlignment: true,
            fullAlignment: true,
            conservativeMode,
            aggressiveMode,
            conservative5mOpposing,
          },
        }
      }

      if (conservativeMode && strongTimeframes >= 3 && !conservative5mOpposing) {
        return {
          tier: 3,
          mode: "conservative",
          debugInfo: {
            strongTimeframes,
            partialAlignment: true,
            fullAlignment: true,
            conservativeMode,
            aggressiveMode,
            conservative5mOpposing,
          },
        }
      }

      if (conservativeMode && conservative5mOpposing) {
        return {
          tier: 2,
          mode: "conservative",
          debugInfo: {
            strongTimeframes,
            partialAlignment: true,
            fullAlignment: false,
            conservativeMode,
            aggressiveMode,
            conservative5mOpposing,
          },
        }
      }

      return {
        tier: 2,
        mode: aggressiveMode ? "aggressive" : conservativeMode ? "conservative" : "none",
        debugInfo: {
          strongTimeframes,
          partialAlignment: true,
          fullAlignment: false,
          conservativeMode,
          aggressiveMode,
          conservative5mOpposing,
        },
      }
    }

    return {
      tier: 1,
      mode: "none",
      debugInfo: {
        strongTimeframes,
        partialAlignment: false,
        fullAlignment: false,
        conservativeMode,
        aggressiveMode,
        conservative5mOpposing,
      },
    }
  }

  if (conservativeMode || aggressiveMode) {
    let tier = 0
    if (score4h.score >= 3) tier++
    if (score1h.score >= 2) tier++
    if (score15m.score >= 1) tier++
    if (score5m.score >= 1) tier++

    if (tier === 4) {
      if (conservativeMode && conservative5mOpposing) {
        return {
          tier: 2,
          mode: "conservative",
          debugInfo: {
            strongTimeframes,
            partialAlignment: true,
            fullAlignment: false,
            conservativeMode,
            aggressiveMode,
            conservative5mOpposing,
          },
        }
      }

      return {
        tier: 4,
        mode: conservativeMode ? "conservative" : "aggressive",
        debugInfo: {
          strongTimeframes,
          partialAlignment: true,
          fullAlignment: true,
          conservativeMode,
          aggressiveMode,
          conservative5mOpposing,
        },
      }
    }

    if (conservativeMode && conservative5mOpposing) {
      return {
        tier: 2,
        mode: "conservative",
        debugInfo: {
          strongTimeframes,
          partialAlignment: true,
          fullAlignment: false,
          conservativeMode,
          aggressiveMode,
          conservative5mOpposing,
        },
      }
    }

    return {
      tier: Math.max(2, tier),
      mode: conservativeMode ? "conservative" : "aggressive",
      debugInfo: {
        strongTimeframes,
        partialAlignment: true,
        fullAlignment: tier >= 3,
        conservativeMode,
        aggressiveMode,
        conservative5mOpposing,
      },
    }
  }

  return {
    tier: 0,
    mode: "none",
    debugInfo: {
      strongTimeframes,
      partialAlignment: false,
      fullAlignment: false,
      conservativeMode,
      aggressiveMode,
      conservative5mOpposing,
    },
  }
}
