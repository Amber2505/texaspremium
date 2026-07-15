// app/api/unpaid-links/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export async function GET(req: NextRequest) {
  let client: MongoClient | null = null;
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

    client = await MongoClient.connect(process.env.MONGODB_URI!);
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

    // Step 2 — get all PAID links so we can deduplicate
    const paidLinks = await col.find({
      "completedStages.payment": true,
      linkType: "payment",
    }).toArray();

    // Step 3 — filter out unpaid links where same phone has a paid link within ±10 days
    const filtered = unpaid.filter(unpaidLink => {
      const phone = (unpaidLink.customerPhone || "").replace(/\D/g, "");
      if (!phone) return true; // can't deduplicate without phone

      const hasPaidDuplicate = paidLinks.some(paid => {
        const paidPhone = (paid.customerPhone || "").replace(/\D/g, "");
        if (paidPhone !== phone) return false;

        // Check if paid link timestamp is within ±10 days of the unpaid link
        const timeDiff = Math.abs(
          (paid.createdAtTimestamp || 0) - (unpaidLink.createdAtTimestamp || 0)
        );
        return timeDiff <= TEN_DAYS;
      });

      return !hasPaidDuplicate;
    });

    return NextResponse.json({ success: true, links: filtered });
  } catch (err) {
    console.error("Unpaid links error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    if (client) await client.close();
  }
}