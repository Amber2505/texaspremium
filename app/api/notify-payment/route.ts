import { NextResponse } from "next/server";

export async function POST() {
  // Completely disabled to prevent duplicates with Webhook
  return NextResponse.json({ status: "disabled_use_webhook_instead" });
}