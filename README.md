# SwitchCX Dashboard

AI-powered crypto trading dashboard targeting 3% returns on top 100 L1 tokens.

## Features

- **Real-time Price Data**: Fetches USD prices and 30-day hourly history from CoinGecko
- **Technical Indicators**: EMA8/21, MACD, Stoch RSI, trendline breaks, support/resistance
- **AI Trading Signals**: Hugging Face FinBERT model for sentiment analysis
- **3% Return Targeting**: Automatic target and stop-loss calculation (3% profit, 2% stop)
- **Top 100 L1 Tokens**: Comprehensive coverage of major Layer 1 blockchains
- **Neobrutalist Design**: Bold, high-contrast UI with thick borders and strong shadows

## Project Structure

This is a **Vite + React** application designed for **Netlify deployment**, not Next.js.

\`\`\`
switchcx-dashboard/
├── src/                          # Vite React app
│   ├── App.tsx                   # Main dashboard component
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # Tailwind + neobrutalist styles
│   ├── components/ui/            # UI components
│   ├── utils/indicators.js       # Technical indicator calculations
│   └── lib/utils.ts              # Utility functions
├── netlify/functions/            # Serverless functions
│   ├── price.js                  # CoinGecko price fetcher
│   └── signal.js                 # Hugging Face AI signals
├── index.html                    # HTML entry point
├── vite.config.js                # Vite configuration
├── netlify.toml                  # Netlify deployment config
└── package.json                  # Dependencies
\`\`\`

## Setup

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Configure Netlify Environment Variables

In your Netlify site settings (or via the v0 Vars sidebar), add:

\`\`\`
HUGGINGFACE_API_KEY=your_hugging_face_api_key_here
\`\`\`

Get your free API key at: https://huggingface.co/settings/tokens

### 3. Deploy to Netlify

**Option A: Via v0 (Recommended)**
- Click the "Publish" button in the top right of v0
- This will automatically deploy to Netlify with the correct configuration

**Option B: Via Netlify CLI**
\`\`\`bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize site
netlify init

# Deploy
netlify deploy --prod
\`\`\`

**Option C: Via GitHub**
- Push code to GitHub
- Connect repository in Netlify UI
- Netlify will auto-detect the configuration from netlify.toml

## Local Development

\`\`\`bash
# Start Vite dev server (frontend only)
npm run dev
\`\`\`

**Note**: Netlify functions won't work in local Vite dev mode. To test functions locally:

\`\`\`bash
# Install Netlify CLI
npm install -g netlify-cli

# Run with Netlify Dev (includes functions)
netlify dev
\`\`\`

## API Endpoints

### `/.netlify/functions/price`

Returns price data and 30-day hourly history for top 100 L1 tokens.

**Response Format:**
\`\`\`json
{
  "BTC-USD": {
    "coinId": "bitcoin",
    "price": 42000.12,
    "high": 43000.1,
    "low": 41000.2,
    "change24h": 2.45,
    "open": 41800.5,
    "history": [42312.4, 42210.1, ...],
    "history_length": 720,
    "debug": "market_chart hourly ok"
  },
  ...
}
\`\`\`

**Test:**
\`\`\`bash
curl https://your-site.netlify.app/.netlify/functions/price
\`\`\`

### `/.netlify/functions/signal`

Returns AI-powered trading signal with 3% return targeting.

**Parameters:**
- `symbol`: Token symbol (e.g., BTC-USD)
- `closes`: JSON array of closing prices
- `ema8`, `ema21`, `macd`, `stoch_rsi`: Technical indicators
- `price`: Current price
- `target_return`: Target return percentage (default: 3)

**Response Format:**
\`\`\`json
{
  "symbol": "BTC-USD",
  "signal": "long",
  "confidence": "0.750",
  "target": "43260.00",
  "stop": "41160.00",
  "expected_return": "3.00%",
  "risk_reward": "1.5:1",
  "ts": "2025-01-10T12:00:00.000Z"
}
\`\`\`

**Test:**
\`\`\`bash
curl "https://your-site.netlify.app/.netlify/functions/signal?symbol=BTC-USD&closes=[42000,42100]&ema8=42050&ema21=41900&macd=0.5&stoch_rsi=0.6&price=42100&target_return=3"
\`\`\`

## Architecture

- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4
- **Serverless Functions**: Netlify Functions (Node.js 18+)
- **Data Sources**: 
  - CoinGecko API (free tier, no API key required)
  - Hugging Face Inference API (requires free API key)
- **Deployment**: Netlify (automatic builds from Git)

## Trading Logic

The dashboard combines multiple signals with priority weighting:

1. **Trendline Break** (weight: 3) - Detects momentum shifts over 20-period lookback
2. **Support/Resistance** (weight: 2) - Identifies key price levels within 0.5% threshold
3. **Stoch RSI** (weight: 2) - Oversold (<0.2) / Overbought (>0.8) conditions
4. **EMA Trend** (weight: 1) - 8/21 crossover for trend direction
5. **MACD** (weight: 1) - Momentum confirmation (12/26/9 periods)

**Signal Generation:**
- **Long**: Combined score ≥ 4
- **Short**: Combined score ≤ -4
- **Hold**: Score between -3 and 3

**AI Enhancement:**
- Uses FinBERT (Financial BERT) for sentiment analysis
- Combines AI sentiment (60%) with technical indicators (40%)
- Fallback to pure technical analysis if AI API fails

**Risk Management:**
- Target: +3% from entry price
- Stop Loss: -2% from entry price
- Risk/Reward Ratio: 1.5:1

## Rate Limits & Caching

**CoinGecko (Free Tier):**
- ~50 calls/minute
- In-memory caching: 30 seconds
- Per-coin throttling: 150ms delay
- Batch processing: 50 coins per request

**Hugging Face (Free Tier):**
- Varies by model usage
- Automatic retry logic on rate limits
- Fallback to technical analysis on errors

## Environment Variables

Set these in Netlify site settings or v0 Vars sidebar:

| Variable | Required | Description |
|----------|----------|-------------|
| `HUGGINGFACE_API_KEY` | Yes | Hugging Face API key for AI signals |

## Troubleshooting

**Functions not working locally?**
- Use `netlify dev` instead of `npm run dev`
- Ensure Netlify CLI is installed: `npm install -g netlify-cli`

**AI signals returning errors?**
- Check that `HUGGINGFACE_API_KEY` is set in Netlify environment variables
- Verify API key is valid at https://huggingface.co/settings/tokens
- Dashboard will fallback to technical analysis if AI fails

**CoinGecko rate limits?**
- Free tier has ~50 calls/minute
- Caching reduces API calls (30s TTL)
- Consider upgrading CoinGecko plan for higher limits

**No data showing?**
- Check browser console for errors
- Verify Netlify functions are deployed
- Test endpoints directly: `curl https://your-site.netlify.app/.netlify/functions/price`

## License

MIT
