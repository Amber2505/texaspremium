// app/api/accounting/ignored/route.ts
// Square payments staff marked "ignore" on the reconciliation (no AgencyMatrix
// receipt for a known reason), each with a note. They stop counting as unmatched.
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type IgnoredDoc = {
  _id: string; // Square payment id
  dateKey: string; // CST date of the payment, YYYY-MM-DD
  amount: number;
  note: string;
  createdAt: Date;
};

async function coll() {
  return (await clientPromise)
    .db("db")
    .collection<IgnoredDoc>("accounting_ignored");
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const month = req.nextUrl.searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json(
      { error: "month=YYYY-MM required" },
      { status: 400 },
    );
  const ignored = await (
    await coll()
  )
    .find({ dateKey: { $regex: `^${month}` } })
    .sort({ dateKey: 1 })
    .toArray();
  return NextResponse.json({ ignored });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    dateKey?: string;
    amount?: number;
    note?: string;
  };
  const note = String(b.note || "").trim();
  if (!b.id || !/^\d{4}-\d{2}-\d{2}$/.test(b.dateKey || "") || !note)
    return NextResponse.json(
      { error: "Add a note saying why it's ignored" },
      { status: 400 },
    );
  await (
    await coll()
  ).updateOne(
    { _id: String(b.id) },
    {
      $set: {
        dateKey: b.dateKey!,
        amount: Number(b.amount) || 0,
        note: note.slice(0, 300),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await (await coll()).deleteOne({ _id: String(id) });
  return NextResponse.json({ success: true });
}