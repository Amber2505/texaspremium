// app/api/unsold-quotes/route.ts
// Server-side proxy to astral_api — the office key never reaches the browser.
import { NextRequest, NextResponse } from "next/server";

const ASTRAL = "https://astraldbapi.herokuapp.com";
const KEY = process.env.OFFICE_CAPTURE_KEY || "";

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "OFFICE_CAPTURE_KEY not set" }, { status: 500 });
  const days = req.nextUrl.searchParams.get("days") || "30";
  const res = await fetch(
    `${ASTRAL}/quotes/list?status=all&days=${encodeURIComponent(days)}`,
    { headers: { "X-Office-Key": KEY }, cache: "no-store" },
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "OFFICE_CAPTURE_KEY not set" }, { status: 500 });
  const { phone, status, note, by } = await req.json().catch(() => ({}));
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length !== 10) return NextResponse.json({ error: "Bad phone" }, { status: 400 });

  const body = new URLSearchParams();
  if (status) body.set("status", String(status));
  if (note) body.set("note", String(note));
  body.set("by", String(by || ""));

  const res = await fetch(`${ASTRAL}/quotes/${digits}/update`, {
    method: "POST",
    headers: { "X-Office-Key": KEY },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}