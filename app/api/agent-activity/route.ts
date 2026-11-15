// app/api/agent-activity/route.ts
// Server-side proxy to astral_api — the office key never reaches the browser.
import { NextRequest, NextResponse } from "next/server";

const ASTRAL = "https://astraldbapi.herokuapp.com";
const KEY = process.env.OFFICE_CAPTURE_KEY || "";

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "OFFICE_CAPTURE_KEY not set" }, { status: 500 });
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Bad date" }, { status: 400 });
  }
  const res = await fetch(`${ASTRAL}/activity/day?date=${date}`, {
    headers: { "X-Office-Key": KEY },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}