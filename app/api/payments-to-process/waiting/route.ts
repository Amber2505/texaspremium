// app/api/payments-to-process/waiting/route.ts
// Same queue as the parent route, trimmed for the Chrome extension.
// Needs the office key, since the extension calls it from every office computer.
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const TRACK_SINCE =
  process.env.PROCESSING_TRACK_SINCE || "2026-10-27T00:00:00.000Z";
const KEY = process.env.OFFICE_CAPTURE_KEY || "";

function fmtPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

export async function GET(req: Request) {
  const key = req.headers.get("x-office-key") || "";
  if (!KEY || key !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const client = await clientPromise;
    const links = await client
      .db("db")
      .collection("payment_link_generated")
      .find({
        "completedStages.payment": true,
        processedAt: { $exists: false },
        $or: [
          { "timestamps.payment": { $gte: TRACK_SINCE } },
          { "timestamps.payment": { $gte: new Date(TRACK_SINCE) } },
        ],
      })
      .sort({ "timestamps.payment": 1 })
      .limit(100)
      .project({
        customerPhone: 1, amount: 1, description: 1, timestamps: 1,
        createdAtTimestamp: 1, processingAlerts: 1,
      })
      .toArray();

    return NextResponse.json({
      links: links.map((l) => ({
        id: String(l._id),
        phone: fmtPhone(l.customerPhone || ""),
        amount: l.amount ? `$${(l.amount / 100).toFixed(2)}` : "",
        description: (l.description || "").slice(0, 120),
        // Overnight payments count from office open, same as the Railway server
        paidAt: new Date(
          Math.max(
            new Date(l.timestamps?.payment || l.createdAtTimestamp).getTime(),
            l.processingAlerts?.firstSeenOpenAt
              ? new Date(l.processingAlerts.firstSeenOpenAt).getTime()
              : 0,
          ),
        ).toISOString(),
      })),
    });
  } catch (err) {
    console.error("payments-to-process/waiting:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}