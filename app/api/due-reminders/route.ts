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
  // Live cloud browser: what it's doing now + any help request (one call for the page)
  if (req.nextUrl.searchParams.get("live")) {
    const opts = {
      headers: { "X-Office-Key": KEY },
      cache: "no-store" as const,
    };
    const [live, help] = await Promise.all([
      fetch(`${ASTRAL}/reminders/live?watch=1`, opts)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${ASTRAL}/reminders/help`, opts)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ]);
    return NextResponse.json({
      live,
      help: (help as { help?: unknown[] }).help || [],
    });
  }
  // Live cloud browser: what it's doing now + any help request (one call for the page)
  if (req.nextUrl.searchParams.get("live")) {
    const opts = {
      headers: { "X-Office-Key": KEY },
      cache: "no-store" as const,
    };
    const [live, help] = await Promise.all([
      fetch(`${ASTRAL}/reminders/live?watch=1`, opts)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${ASTRAL}/reminders/help`, opts)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ]);
    return NextResponse.json({
      live,
      help: (help as { help?: unknown[] }).help || [],
    });
  }
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
  const { id, action, by, host, code, act, control } = await req
    .json()
    .catch(() => ({}));

  // Take control / Stop task / Pause / Resume for the live cloud browser
  if (action === "live") {
    if (!["take", "stop", "pause", "resume"].includes(control))
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const res = await fetch(`${ASTRAL}/reminders/live/control`, {
      method: "POST",
      headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ control }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  // Put today's open checks back in the cloud browser's queue
  if (action === "recheck") {
    const res = await fetch(`${ASTRAL}/reminders/recheck`, {
      method: "POST",
      headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(id ? { ids: [String(id)] } : { all_open: true }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  // Take control / Stop task / Pause / Resume for the live cloud browser
  if (action === "live") {
    if (!["take", "stop", "pause", "resume"].includes(control))
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const res = await fetch(`${ASTRAL}/reminders/live/control`, {
      method: "POST",
      headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ control }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

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
