// app/api/docs/[token]/remove/route.ts
// Public: customers can no longer remove uploaded files. Once something is
// uploaded it stays, so the agent always sees everything the customer sent.
// If a file is wrong, the agent uses "Request more" to ask for a new one.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "not_allowed" }, { status: 403 });
}