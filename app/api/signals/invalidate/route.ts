import { NextResponse } from "next/server"
import { signalStore } from "@/lib/cache/signal-store"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    signalStore.invalidateSignal()

    return NextResponse.json({
      success: true,
      message: "Active signal invalidated",
    })
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
