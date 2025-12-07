# Telegram Integration Setup Guide

This guide will help you set up Telegram alerts for your SwitchCX Gold Trading System.

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat and send the command `/newbot`
3. Follow the prompts:
   - Choose a name for your bot (e.g., "SwitchCX Gold Alerts")
   - Choose a username (must end in 'bot', e.g., "switchcx_gold_bot")
4. BotFather will provide you with a **Bot Token**. Save this token - you'll need it later.
   - Example: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

## Step 2: Get Your Chat ID

### Method 1: Using @userinfobot
1. Search for **@userinfobot** in Telegram
2. Start a chat with it
3. It will immediately send you your Chat ID
4. Save this number (it will look like `123456789`)

### Method 2: Using Telegram Web
1. Send a message to your new bot
2. Open your browser and go to:
   \`\`\`
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   \`\`\`
   Replace `<YOUR_BOT_TOKEN>` with your actual bot token
3. Look for `"chat":{"id":123456789}` in the response
4. That number is your Chat ID

## Step 3: Configure Environment Variables

Add these environment variables to your Vercel project:

\`\`\`env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
\`\`\`

### In Vercel:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add both variables
4. Redeploy your project

## Step 4: Test the Integration

After deploying with the environment variables, test your setup:

1. Visit: `https://your-domain.vercel.app/api/telegram/test`
2. You should receive a test message in your Telegram chat
3. If successful, you'll see a success message in the browser

## Alert Types

Your bot will send the following types of alerts:

### 🟢 Entry Signals
- Direction (LONG/SHORT)
- Entry price
- Stop loss
- Take profit
- Chandelier stop
- Breakout zone details
- Volatility metrics
- Timeframe confirmations

### ✅ Exit Signals
- Exit price
- P&L
- Exit reason
- Signal status

### 🚨 Breakout Alerts
- Price level broken
- Current price
- Confirmation status

### 🔄 Trend Changes
- New trend direction
- Monitoring status

### ⚠️ Market Conditions
- Chop range detection
- Volatility warnings
- Session filters

### ❌ System Errors
- API failures
- Data fetch errors
- System status

## Troubleshooting

### Not Receiving Messages?
1. Make sure you've started a chat with your bot (send `/start`)
2. Verify your Chat ID is correct
3. Check that your Bot Token is valid
4. Ensure environment variables are set in production

### Wrong Chat Receiving Messages?
1. Double-check your Chat ID
2. If you want to send to a group, use the group's Chat ID (it will be negative)

### Bot Not Responding?
1. Make sure the bot token is correct
2. Verify the bot hasn't been deleted or blocked
3. Check Vercel logs for error messages

## Security Notes

- **Never commit** your Bot Token or Chat ID to version control
- Use Vercel's environment variables feature
- Consider using a dedicated Telegram account for trading alerts
- For group alerts, be careful about who can see your trading signals

## Next Steps

Once configured, your system will automatically send alerts:
- Every 10 minutes when the cron job runs
- When new signals are generated
- When signals are closed
- On market condition changes
- On system errors

Enjoy your automated trading alerts! 🚀
