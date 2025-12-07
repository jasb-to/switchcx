export interface MarketStatus {
  isOpen: boolean
  message: string
  nextOpen?: Date
  nextClose?: Date
}

export function getGoldMarketStatus(): MarketStatus {
  const now = new Date()
  const utcDay = now.getUTCDay()
  const utcHours = now.getUTCHours()
  const utcMinutes = now.getUTCMinutes()

  // Convert to minutes since start of week for easier comparison
  const currentMinutes = utcDay * 24 * 60 + utcHours * 60 + utcMinutes

  // Gold market hours (UTC):
  // Opens: Sunday 23:00 UTC (Sunday 6pm ET)
  // Closes: Friday 22:00 UTC (Friday 5pm ET)
  const sundayOpenMinutes = 0 * 24 * 60 + 23 * 60 // Sunday 23:00 UTC
  const fridayCloseMinutes = 5 * 24 * 60 + 22 * 60 // Friday 22:00 UTC

  // Market is closed from Friday 22:00 UTC to Sunday 23:00 UTC
  const isWeekendClosed = currentMinutes >= fridayCloseMinutes || currentMinutes < sundayOpenMinutes

  if (isWeekendClosed) {
    // Calculate next open time (Sunday 23:00 UTC)
    const daysUntilSunday = utcDay === 0 ? 0 : utcDay === 6 ? 1 : 7 - utcDay
    const nextOpen = new Date(now)
    nextOpen.setUTCDate(now.getUTCDate() + daysUntilSunday)
    nextOpen.setUTCHours(23, 0, 0, 0)

    if (utcDay === 0 && currentMinutes < sundayOpenMinutes) {
      // It's Sunday but before market open
      return {
        isOpen: false,
        message: `Market opens in ${Math.floor((sundayOpenMinutes - currentMinutes) / 60)}h ${(sundayOpenMinutes - currentMinutes) % 60}m`,
        nextOpen,
      }
    }

    return {
      isOpen: false,
      message: "Weekend - Market closed",
      nextOpen,
    }
  }

  // Market is open during the week
  const nextClose = new Date(now)
  const daysUntilFriday = 5 - utcDay
  nextClose.setUTCDate(now.getUTCDate() + (daysUntilFriday < 0 ? 5 : daysUntilFriday))
  nextClose.setUTCHours(22, 0, 0, 0)

  return {
    isOpen: true,
    message: "Market open",
    nextClose,
  }
}

export function formatMarketHours(status: MarketStatus): string {
  if (status.isOpen) {
    if (status.nextClose) {
      const hoursUntilClose = Math.floor((status.nextClose.getTime() - Date.now()) / (1000 * 60 * 60))
      if (hoursUntilClose < 2) {
        return "Market closing soon"
      }
    }
    return "Market Open"
  }

  return status.message
}
