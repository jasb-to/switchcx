# SwitchCX Gold Trading System

A professional, production-ready XAUUSD (Gold) trading system featuring multi-timeframe breakout detection, Chandelier exit strategy, and comprehensive risk management.

## Features

### Trading Strategy
- **Breakout Entry Strategy**: Detects range breaks, structure breaks, and volatility expansion
- **Chandelier Exit**: Dynamic trailing stops based on ATR
- **Multi-Timeframe Analysis**: 4H, 1H, 15m, and 5m confirmations
- **Volatility Filters**: ATR-based range expansion/compression detection
- **Session Filtering**: Trades during London, New York, and overlap sessions
- **Chop Range Detection**: Avoids consolidation periods
- **Market Hours Detection**: Automatically monitors gold market hours (closed weekends)

### Tiered Alert System
- **0-1/4 Confirmations**: No alert (monitoring phase)
- **2/4 Confirmations**: Get Ready alert with timeframe scores
- **3/4 Confirmations**: Limit Order alert with entry details
- **4/4 Confirmations**: Enter Now alert with full trade setup

### Risk Management
- Max risk per trade (2% default)
- Max trades per session limit (3 default)
- Consecutive loss lockout (3 losses)
- ATR-based stop loss validation

### Technical Components
- **Data Source**: Twelve Data API for real-time OHLCV data (uses **real live market data**)
- **Indicators**: EMA(50/200), ADX (displayed in all timeframe cards), ATR, Chandelier Exit
- **Breakout Detection**: Dynamic support/resistance zone clustering
- **Volume Confirmation**: 1.2x average volume requirement (optimized for quality + frequency)
- **5m Confirmation**: Prevents fakeout entries
- **Market Hours**: Tracks gold trading hours (closed Friday 5pm ET - Sunday 6pm ET)

## Setup

### 1. Clone and Install

\`\`\`bash
git clone https://github.com/jasb-to/switchcx.git
cd switchcx
npm install
\`\`\`

### 2. Environment Variables

Create a `.env.local` file with:

\`\`\`env
# Twelve Data API (required)
TWELVE_DATA_API_KEY=your_api_key_here

# Telegram (optional but recommended)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Vercel Cron Secret (auto-generated on Vercel)
CRON_SECRET=auto_generated_by_vercel
\`\`\`

### 3. Get API Keys

#### Twelve Data API
1. Sign up at [twelvedata.com](https://twelvedata.com)
2. Get your free API key (800 credits/day)
3. Add to environment variables
4. **Optimized for Free Tier**: 
   - Fetches 200 candles per timeframe (sufficient for all indicators)
   - 15-minute caching reduces API calls significantly
   - ~576 credits/day with 10-minute scans = well within 800 limit
   - 1.5s delays between requests to avoid rate limiting

#### Telegram Bot (Optional)
See [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md) for detailed instructions.

### 4. Deploy to Vercel

\`\`\`bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
\`\`\`

**Note**: Since you're using an external cron service (not Vercel's built-in cron jobs), there's no `vercel.json` configuration needed. Your external cron service should hit the endpoint directly.

### 5. Setup External Cron Job

Since Vercel Hobby accounts are limited to daily cron jobs, use an external cron service to trigger the endpoint every 10 minutes:

**Recommended Services**:
- [cron-job.org](https://cron-job.org) - Free, reliable
- [EasyCron](https://www.easycron.com) - Free tier available
- [Uptime Robot](https://uptimerobot.com) - Monitors + triggers

**Configuration**:
1. Create a new cron job
2. Set URL: `https://switchcx.vercel.app/api/cron/scan?secret=abc123xyz789`
3. Set interval: Every 10 minutes (*/10 * * * *)
4. Method: GET
5. Enable the job

**Your secret**: Replace `abc123xyz789` with the value from your `CRON_SECRET` environment variable.

## Deployment Readiness

### ✅ Ready to Deploy
- All core functionality implemented
- Real data integration with Twelve Data API
- Rate limiting handled (2s between requests, 5min cache)
- Progressive alert system (2/4, 3/4, 4/4 tiers)
- Telegram integration working
- Professional dashboard with real-time updates

### 📊 Data Source
The system uses **REAL LIVE DATA** from Twelve Data API:
- Fetches 200 candles per timeframe (enough for 200-candle indicators)
- Updates every 10 minutes via cron job
- Caches for 15 minutes to reduce API calls
- Handles rate limits automatically

### 🎯 Trade Display
Trade details populate both:
1. **Dashboard Cards**: Active Trade card shows entry, stop loss, TP1, TP2
2. **Telegram Alerts**: Progressive notifications with increasing detail
   - 2/4: Market building (timeframe scores)
   - 3/4: Setup forming (limit order with entry zone)
   - 4/4: All confirmed (enter now with full trade details)

### 📋 Entry Instructions Card
New "Entry Instructions" card on dashboard provides:
- 5-point scoring system explanation
- What each criteria means (ADX, Volume, EMA, Trend, Volatility)
- Progressive alert tier breakdown (0-1/4, 2/4, 3/4, 4/4)
- Step-by-step execution guide

## How It Works

### Analysis Cycle (Every 10 Minutes)

1. **Data Fetching**: Pulls 200 candles for all timeframes (4H, 1H, 15m, 5m) from Twelve Data API
2. **Trend Analysis**: Detects 4H and 1H trends using EMA crossovers (displays as bullish/bearish/ranging)
3. **Timeframe Scoring**: Evaluates each timeframe on 5 criteria:
   - **ADX strength** (> 15 for 1H, > 18 for others) - value shown in all cards
   - **Volume** (1.2x above average)
   - **EMA alignment** (50/200 positioning)
   - **Trend direction** clarity
   - **Volatility** presence
4. **Confirmation Requirements & Alert Tiers**:
   - **Simplified Logic**: Requires 2+ timeframes with 2+ score
   - **Less Conservative**: Catches more valid setups without sacrificing quality
   - **0-1/4 met**: No alert (monitoring)
   - **2/4 met**: GET READY alert sent
   - **3/4 met**: LIMIT ORDER alert sent with entry zone
   - **4/4 met**: ENTER NOW alert sent with full trade details
5. **Breakout Detection**: Identifies key support/resistance zones
6. **Entry Validation**:
   - Breakout confirmed on 1H timeframe
   - Validate with volume > 1.2x average
   - Confirm 5m candle close beyond breakout level
   - Check session (London/NY/Overlap or high volatility Asian)
   - Ensure not in chop range (ATR > 70% of average)
7. **Signal Generation**: Creates entry with Chandelier stop, TP1, TP2
8. **Alert Dispatch**: Sends progressive Telegram notifications based on tier

### Entry Logic

\`\`\`
IF all confirmations met:
  1. Detect breakout on 1H timeframe
  2. Validate with volume > 1.2x average
  3. Confirm 5m candle close beyond breakout
  4. Check session (London/NY/Overlap or high volatility Asian)
  5. Ensure not in chop range (ATR > 70% of average)
  6. Calculate Chandelier stop (22-period, 3x ATR)
  7. Generate signal with entry, stop, TP1, TP2
  8. Display in dashboard AND send Telegram alert
\`\`\`

### Exit Logic

\`\`\`
IF signal active:
  - Monitor Chandelier trailing stop (updates each candle)
  - Exit if price hits Chandelier stop
  - Exit if trend reverses (EMA crossover)
  - Update stop in real-time on dashboard
  - Alert on Telegram when exit triggers
\`\`\`

## API Endpoints

### `/api/signals` (GET)
Returns current market state and analysis:
- Current price
- Trend directions (bullish/bearish/ranging)
- Volatility metrics
- Timeframe scores (including ADX values)
- Active trade details (entry, stop, TPs)
- Last update timestamp

### `/api/cron/scan` (GET)
Cron job endpoint (secured with CRON_SECRET query parameter):
- Runs every 10 minutes via external cron service
- Analyzes market conditions
- Calculates alert tier (0-4)
- **ONLY SOURCE OF TELEGRAM ALERTS** - Dashboard does NOT send alerts
- Sends progressive Telegram alerts (only when markets are open):
  - **2/4**: Get Ready (market building)
  - **3/4**: Limit Order (setup forming)
  - **4/4**: Enter Now (all confirmations met)
- URL format: `/api/cron/scan?secret=your_cron_secret_here`
- **Important**: Alerts only sent during market hours (Sunday 6pm ET - Friday 5pm ET)
- **Note**: Browser refreshes do NOT trigger alerts - only automated cron scans do

### `/api/telegram/test` (GET)
Tests Telegram integration:
- Validates bot token
- Sends test message
- Returns connection status
- **Can be triggered from dashboard via "Test Telegram" button**

## Dashboard

The professional dashboard displays:

1. **Market Header**
   - Current XAUUSD price
   - **Market status indicator** (open/closed with countdown)
   - **Visual confirmation tier indicator** (0/4, 1/4, 2/4, 3/4, 4/4) with animated progress bars
   - 4H and 1H trend indicators (bullish/bearish/ranging)
   - Current trading session
   - Chop range warning
   - Volatility score
   - **Test Telegram button** for connection verification

2. **Timeframe Scoreboard**
   - Visual score cards for each timeframe (4H, 1H, 15m, 5m)
   - Individual criteria status with checkmarks
   - **ADX value displayed in all timeframe cards**
   - Confirmation requirements
   - Met/Not Met badges

3. **Active Trade Card** (NEW)
   - Entry price and direction (bullish/bearish)
   - Stop loss (Chandelier exit)
   - Take profit targets (TP1, TP2)
   - Chandelier stop updates in real-time
   - Current P&L if trade is active

4. **Entry Instructions Card** (NEW)
   - Complete guide to the 5-point scoring system
   - Progressive alert tier breakdown
   - Step-by-step trade execution instructions
   - What to look for at each tier (2/4, 3/4, 4/4)

## Performance Targets

The system aims for **2-5 quality signals per week** with **60-75% win rate** through:
- Multi-timeframe confirmation reducing false signals
- Session filtering for optimal volatility
- Fakeout protection via 5m confirmation
- Chop range avoidance
- Disciplined risk management
- **Balanced approach**: Not overly conservative, catches valid setups

## Architecture

\`\`\`
switchcx/
├── app/
│   ├── api/
│   │   ├── cron/scan/         # Cron job endpoint
│   │   ├── signals/          # Market data API
│   │   └── telegram/test/    # Telegram test
│   ├── page.tsx              # Dashboard UI
│   └── layout.tsx
├── lib/
│   ├── api/
│   │   └── twelve-data.ts    # Data client with rate limiting
│   ├── strategy/
│   │   ├── engine.ts         # Main strategy
│   │   ├── indicators.ts     # Technical indicators (ADX fixed)
│   │   ├── breakout-detector.ts
│   │   └── session-filter.ts
│   ├── telegram/
│   │   └── client.ts         # Tiered alert system
│   └── types/
│       └── trading.ts        # TypeScript types
├── components/
│   ├── market-header.tsx
│   ├── timeframe-scoreboard.tsx
│   ├── active-trade-card.tsx      # NEW
│   ├── entry-instructions-card.tsx # NEW
│   └── signals-feed.tsx (removed)
└── vercel.json               # Cron configuration
\`\`\`

## Future Enhancements

- [ ] Database integration for signal history
- [ ] Backtesting module with historical data
- [ ] Additional indicators (RSI, MACD, Bollinger Bands)
- [ ] Multi-symbol support (EURUSD, GBPUSD, etc.)
- [ ] Advanced charting with TradingView
- [ ] Position sizing calculator
- [ ] Performance analytics dashboard
- [ ] Discord/Slack integration
- [ ] Mobile app

## Market Hours

Gold (XAUUSD) trades 23 hours/day, 5 days/week:
- **Market Open**: Sunday 6:00 PM ET (23:00 UTC)
- **Market Close**: Friday 5:00 PM ET (22:00 UTC)

The system automatically:
- Detects when markets are closed (weekends)
- Displays market status with countdown to next open
- Prevents alerts during closed periods
- Shows "Market Closed" badge instead of tier status

**Note**: Markets close at 11pm your local time tonight if it's Friday, and reopen Sunday evening.

## Troubleshooting

### ADX Showing N/A
- System needs 100+ candles minimum for ADX calculation
- Wait for cron job to fetch fresh data
- Free tier fetches 200 candles (sufficient for all indicators)
- If persists, check Twelve Data API quota

### API Rate Limit Errors
- Free tier: 800 credits/day
- **Optimized Usage**: System uses ~576 credits/day with 10-minute scans
- Each scan: 4 timeframes × 1 credit + 1 price = 5 credits
- 6 scans/hour × 24 hours = 144 scans/day × 4 = 576 credits
- **224 credits buffer** for manual dashboard refreshes
- Each fetch cached for 15 minutes (reduced API load)
- Requests spaced 1.5 seconds apart automatically
- If you hit limits, increase cache time or reduce scan frequency

### Cron Job Not Running
- Verify your external cron service (cron-job.org, etc.) is active
- Check the cron job URL is correct: `https://switchcx.vercel.app/api/cron/scan?secret=YOUR_SECRET`
- Ensure CRON_SECRET environment variable matches the secret in the URL
- Check cron service logs for any errors or failed requests
- The endpoint returns 401 if the secret is incorrect

### No Alerts Being Sent
- **Alerts are ONLY sent from the cron job** - refreshing the dashboard does NOT send alerts
- Verify your external cron service (cron-job.org) is running every 10 minutes
- Test Telegram first using the dashboard button
- Check that 2/4, 3/4, or 4/4 confirmations are being met
- Verify timeframe scores in dashboard (need 2/2/1/1 minimum)
- Review logs for alert tier progression
- 0-1/4 confirmations = no alert (by design)
- **Alerts disabled during market closed hours (Friday 5pm ET - Sunday 6pm ET)**
- Check cron job logs at your external cron service dashboard

### Telegram Test Button Not Working
- Ensure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in environment variables
- Check bot token is valid
- Verify chat ID is correct (numeric value)
- See [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md) for setup

### Market Shows as Closed
- Gold markets close Friday 5pm ET and reopen Sunday 6pm ET
- Check your current timezone vs market hours (ET/UTC)
- System continues to fetch data but won't send alerts when closed
- Dashboard shows countdown to next market open

## Signal Quality Expectations

**Realistic Targets**:
- **Signal Frequency**: 2-5 quality setups per week (not per day)
- **Win Rate**: 60-75% (with proper execution)
- **Risk/Reward**: 2:1 minimum (TP1), 3-4:1 potential (TP2)
- **Strategy Type**: Breakout continuation (requires patience)

**What to Expect**:
- Most of the time you'll see tier 0-2 (no action)
- Tier 3-4 signals should be selective but not overly rare
- System is balanced: not too conservative, not too aggressive
- Quality over quantity approach

**Paper Trading Recommended**:
- Track signals for 2 weeks before live trading
- Verify win rate meets expectations
- Adjust sensitivity if needed (ADX thresholds, volume multipliers)
- Monitor for false breakouts in your specific market conditions

## License

MIT

## Support

For issues or questions, open a GitHub issue or contact support.

---

Built with Next.js 16, TypeScript, Tailwind CSS, and deployed on Vercel.
