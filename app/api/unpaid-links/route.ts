// app/api/unpaid-links/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "1w";
    const ranges: Record<string, number> = {
      "1d": 24 * 60 * 60 * 1000,
      "1w": 7 * 24 * 60 * 60 * 1000,
      "1m": 30 * 24 * 60 * 60 * 1000,
    };
    const since = Date.now() - (ranges[range] ?? ranges["1w"]);
    const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

    // Pooled client — MongoClient.connect per request meant a full TLS +
    // auth handshake before every query, which was most of the wait.
    const client = await connectToDatabase;
    const col = client.db("db").collection("payment_link_generated");

    // Step 1 — get all unpaid payment links in the time window
    const unpaid = await col.find({
      createdAtTimestamp: { $gte: since },
      linkType: "payment",
      generatedLink: { $exists: true, $nin: [null, "", "placeholder"] },
      $or: [
        { "completedStages.payment": { $exists: false } },
        { "completedStages.payment": false },
        { "completedStages.payment": null },
        { completedStages: { $exists: false } },
      ],
    }).sort({ createdAtTimestamp: -1 }).toArray(); // newest first

    if (unpaid.length === 0) {
      return NextResponse.json({ success: true, links: [] });
    }

    // Step 2 — paid links, bounded to the only window that can possibly
    // match (±10 days of the unpaid range) and projected to the two fields
    // the comparison actually uses. This was fetching every paid link ever.
    const paidLinks = await col
      .find(
        {
          "completedStages.payment": true,
          linkType: "payment",
          createdAtTimestamp: {
            $gte: since - TEN_DAYS,
            $lte: Date.now() + TEN_DAYS,
          },
        },
        { projection: { customerPhone: 1, createdAtTimestamp: 1 } },
      )
      .toArray();

    // Index paid timestamps by normalized phone — the old nested .some()
    // was O(unpaid × paid) on every request.
    const paidByPhone = new Map<string, number[]>();
    for (const paid of paidLinks) {
      const p = (paid.customerPhone || "").replace(/\D/g, "");
      if (!p) continue;
      const list = paidByPhone.get(p);
      if (list) list.push(paid.createdAtTimestamp || 0);
      else paidByPhone.set(p, [paid.createdAtTimestamp || 0]);
    }

    // Step 3 — drop unpaid links where the same phone paid within ±10 days
    const filtered = unpaid.filter((unpaidLink) => {
      const phone = (unpaidLink.customerPhone || "").replace(/\D/g, "");
      if (!phone) return true; // can't deduplicate without phone

      const paidTimes = paidByPhone.get(phone);
      if (!paidTimes) return true;

      const created = unpaidLink.createdAtTimestamp || 0;
      return !paidTimes.some((t) => Math.abs(t - created) <= TEN_DAYS);
    });

    return NextResponse.json({ success: true, links: filtered });
  } catch (err) {
    console.error("Unpaid links error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}