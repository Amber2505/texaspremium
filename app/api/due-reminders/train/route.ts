// app/api/due-reminders/train/route.ts
// GET:  company names + saved agent site, from company_database
// POST: save the agent site on the company and start a 30-minute training
//       window on astral_api, so the next lookup on that site is trusted right away.
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same values as app/api/due-reminders/route.ts — copy those two lines if yours differ
const ASTRAL =
  process.env.ASTRAL_API_URL || "https://astraldbapi.herokuapp.com";
const KEY = process.env.OFFICE_CAPTURE_KEY || "";

async function companiesColl() {
  const client = await connectToDatabase;
  return client.db("db").collection("company_database");
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const col = await companiesColl();
  const docs = await col
    .find({}, { projection: { name: 1, agentPortal: 1 } })
    .sort({ name: 1 })
    .toArray();
  return NextResponse.json({
    companies: docs
      .filter((d) => d.name)
      .map((d) => ({
        name: String(d.name),
        agentPortal: String(d.agentPortal || ""),
      })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "")
    .trim()
    .slice(0, 120);
  const portal = String(body.portal || "")
    .trim()
    .slice(0, 500);
  const aliases: string[] = Array.isArray(body.aliases)
    ? body.aliases
        .map((a: unknown) => String(a).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (!name)
    return NextResponse.json(
      { error: "Company name is required" },
      { status: 400 },
    );
  try {
    if (new URL(portal).protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.json(
      { error: "The agent site must be an https:// link" },
      { status: 400 },
    );
  }

  // Keep the link on the company (adds the company if only the report knew it)
  const now = new Date();
  const col = await companiesColl();
  await col.updateOne(
    { name },
    {
      $set: { agentPortal: portal, updatedAt: now },
      $setOnInsert: {
        name,
        paymentLink: "",
        claimLink: "",
        claimPhone: "",
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const r = await fetch(`${ASTRAL}/reminders/train`, {
    method: "POST",
    headers: { "X-Office-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ names: [name, ...aliases], portal }),
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}