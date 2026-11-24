// app/api/due-reminders/route.ts
// Admin-only proxy to astral_api's due-date reminder log.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
const ASTRAL =
  process.env.ASTRAL_API_URL || "https://astraldbapi.herokuapp.com";
const KEY = process.env.OFFICE_CAPTURE_KEY || "";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!KEY)
    return NextResponse.json(
      { error: "OFFICE_CAPTURE_KEY not set" },
      { status: 500 },
    );
  // Cloud browser waiting for a person's help (live screenshot)
  if (req.nextUrl.searchParams.get("help")) {
    const r = await fetch(`${ASTRAL}/reminders/help`, {
      headers: { "X-Office-Key": KEY },
      cache: "no-store",
    });
    return NextResponse.json(await r.json().catch(() => ({})), {
      status: r.status,
    });
  }
  // Learned carrier lookups (learning mode)
  if (req.nextUrl.searchParams.get("carriers")) {
    const r = await fetch(`${ASTRAL}/reminders/carriers`, {
      headers: { "X-Office-Key": KEY },
      cache: "no-store",
    });
    return NextResponse.json(await r.json().catch(() => ({})), {
      status: r.status,
    });
  }
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Bad date" }, { status: 400 });
  }
  const res = await fetch(`${ASTRAL}/reminders/day?date=${date}`, {
    headers: { "X-Office-Key": KEY },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!KEY)
    return NextResponse.json(
      { error: "OFFICE_CAPTURE_KEY not set" },
      { status: 500 },
    );
  const { id, action, by, host, code, act } = await req
    .json()
    .catch(() => ({}));

  // A click / typing / Done for the cloud browser that asked for help
  if (action === "help") {
    if (!id || !act || typeof act !== "object")
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const res = await fetch(`${ASTRAL}/reminders/help/act`, {
      method: "POST",
      headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ id: String(id), action: act }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  // Authenticator code the cloud worker is waiting for (e.g. Progressive)
  if (action === "code") {
    if (!host || !code)
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const res = await fetch(`${ASTRAL}/reminders/code`, {
      method: "POST",
      headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ host: String(host), code: String(code) }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  if (!id || !["send", "skip"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const body = new URLSearchParams({
    id: String(id),
    action,
    by: String(by || ""),
  });
  const res = await fetch(`${ASTRAL}/reminders/resolve`, {
    method: "POST",
    headers: { "X-Office-Key": KEY },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}