// app/api/plaid/sync-status/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const col = client.db("db").collection("bank_transactions");

    const [total, oldest, newest, byMonthAgg, config] = await Promise.all([
      col.countDocuments({}),
      col.find({}, { projection: { date: 1, _id: 0 } }).sort({ date: 1 }).limit(1).toArray(),
      col.find({}, { projection: { date: 1, _id: 0 } }).sort({ date: -1 }).limit(1).toArray(),
      col
        .aggregate([
          { $group: { _id: { $substr: ["$date", 0, 7] }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      client.db("db").collection("plaid_config").findOne({ key: "chase_access_token" }),
    ]);

    const oldestDate = oldest[0]?.date || null;
    const newestDate = newest[0]?.date || null;

    // Build a continuous month list and flag gaps
    const byMonth = byMonthAgg.map((m) => ({ month: m._id as string, count: m.count as number }));
    const gaps: string[] = [];
    if (oldestDate && newestDate) {
      const start = new Date(oldestDate + "T12:00:00");
      const end = new Date(newestDate + "T12:00:00");
      const have = new Set(byMonth.map((m) => m.month));
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const stop = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= stop) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        if (!have.has(k)) gaps.push(k);
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    return NextResponse.json({
      total,
      oldestDate,
      newestDate,
      byMonth,
      gaps,
      plaidItemCreatedAt: config?.createdAt || config?.connectedAt || null,
    });
  } catch (err) {
    console.error("sync-status error:", err);
    return NextResponse.json({ error: "Failed to load sync status" }, { status: 500 });
  }
}