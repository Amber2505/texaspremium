// app/api/payments-to-process/route.ts
// Paid links that nobody has posted to the carrier yet.
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// Only payments after this date enter the queue, so years of old paid links
// don't all show up as "unprocessed" on day one. Keep in sync with the page
// and the Railway server.
const TRACK_SINCE =
  process.env.PROCESSING_TRACK_SINCE || "2026-10-27T00:00:00.000Z";

async function coll() {
  const client = await clientPromise;
  return client.db("db").collection("payment_link_generated");
}

export async function GET() {
  try {
    const c = await coll();
    const links = await c
      .find({
        "completedStages.payment": true,
        processedAt: { $exists: false },
        // timestamps.payment may be stored as an ISO string or a Date
        $or: [
          { "timestamps.payment": { $gte: TRACK_SINCE } },
          { "timestamps.payment": { $gte: new Date(TRACK_SINCE) } },
        ],
      })
      .sort({ "timestamps.payment": 1 }) // oldest first — longest waiting on top
      .limit(100)
      .toArray();
    return NextResponse.json({ success: true, links });
  } catch (err) {
    console.error("payments-to-process GET:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { linkId, agentName, confirmation } = await req.json();
    if (!linkId || !String(agentName || "").trim() || !String(confirmation || "").trim()) {
      return NextResponse.json(
        { error: "Name and authorization # are required" },
        { status: 400 },
      );
    }
    if (!/^[A-Za-z0-9-]{4,20}$/.test(String(confirmation).trim())) {
      return NextResponse.json(
        { error: "Authorization # doesn't look valid" },
        { status: 400 },
      );
    }
    const c = await coll();
    const res = await c.updateOne(
      // Guard against two agents marking the same payment
      { _id: new ObjectId(linkId), processedAt: { $exists: false } },
      {
        $set: {
          processedAt: new Date().toISOString(),
          processedBy: String(agentName).trim().slice(0, 60),
          processedConfirmation: String(confirmation).trim().slice(0, 80),
        },
      },
    );
    if (res.matchedCount === 0) {
      return NextResponse.json(
        { error: "Already marked processed by someone else" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("payments-to-process POST:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}