import { NextResponse } from "next/server";

export async function POST() {
  // We are now relying 100% on the Webhook to prevent duplicate emails.
  return NextResponse.json({ message: "Handled by Webhook" });
}