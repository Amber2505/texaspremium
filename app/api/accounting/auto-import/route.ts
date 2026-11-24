// app/api/accounting/auto-import/route.ts
// POST: the cloud browser sends one day of AgencyMatrix Transaction Details each
//       morning (office key). That day is fully replaced, same as Import CSV.
// GET:  the Accounting page shows which days were pulled automatically (admin).
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import {
  REQUIRED_HEADERS,
  rowsToReceipts,
  type RawRow,
} from "@/lib/accountingReceipts";

export const dynamic = "force-dynamic";

type PullDoc = {
  _id: string; // dateKey
  at: Date;
  inserted: number;
  deleted: number;
  rows: number;
};

export async function POST(req: NextRequest) {
  const key = process.env.OFFICE_CAPTURE_KEY || "";
  if (!key || req.headers.get("x-office-key") !== key)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dateKey, headers, rows } = (await req.json().catch(() => ({}))) as {
    dateKey?: string;
    headers?: string[];
    rows?: RawRow[];
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "") || !Array.isArray(rows))
    return NextResponse.json(
      { error: "dateKey and rows required" },
      { status: 400 },
    );

  const db = (await clientPromise).db("db");
  const pulls = db.collection<PullDoc>("accounting_pulls");

  if (rows.length) {
    const missing = REQUIRED_HEADERS.filter(
      (h) => !(headers || []).includes(h),
    );
    if (missing.length)
      return NextResponse.json(
        {
          error: `Report columns changed. Missing: ${missing.join(", ")}`,
          headers,
        },
        { status: 422 },
      );
  }

  // Only this day's receipts (the report is for one day)
  const receipts = rowsToReceipts(rows).filter((r) => r.dateKey === dateKey);
  const col = db.collection("accounting_info");
  let deleted = 0;
  let inserted = 0;
  if (receipts.length) {
    deleted = (await col.deleteMany({ dateKey })).deletedCount;
    const now = new Date();
    inserted = (
      await col.insertMany(
        receipts.map((r) => ({ ...r, importedAt: now, importedBy: "auto" })),
      )
    ).insertedCount;
  }
  await pulls.updateOne(
    { _id: dateKey! },
    { $set: { at: new Date(), inserted, deleted, rows: rows.length } },
    { upsert: true },
  );
  return NextResponse.json({ inserted, deleted, rows: rows.length });
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const pulls = await (await clientPromise)
    .db("db")
    .collection<PullDoc>("accounting_pulls")
    .find({})
    .sort({ _id: -1 })
    .limit(10)
    .toArray();
  return NextResponse.json({ pulls });
}