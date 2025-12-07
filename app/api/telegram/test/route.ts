// Test endpoint for Telegram integration

import { type NextRequest, NextResponse } from "next/server"
import { telegramClient } from "@/lib/telegram/client"

export async function GET(request: NextRequest) {
  try {
    // Test connection
    const isConnected = await telegramClient.testConnection()

    if (!isConnected) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to connect to Telegram API. Check your credentials.",
        },
        { status: 500 },
      )
    }

    // Send test message
    const testSent = await telegramClient.sendAlert({
      type: "status",
      message: "Telegram integration test successful! 🎉\n\nYour SwitchCX Gold Trading System is connected and ready.",
    })

    if (testSent) {
      return NextResponse.json({
        success: true,
        message: "Test message sent successfully to Telegram",
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to send test message",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
