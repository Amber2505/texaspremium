// app/api/accounting/cash-payroll/route.ts
// Cash paid to employees (not through Intuit), entered by hand on the Accounting
// page. Subtracted from net revenue next to Payroll and Payroll fees.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type CashPayrollDoc = {
  _id?: ObjectId;
  date: string; // YYYY-MM-DD
  name: string;
  amount: number;
  note: string;
  createdAt: Date;
};

async function coll() {
  return (await clientPromise)
    .db("db")
    .collection<CashPayrollDoc>("accounting_cash_payroll");
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
  const entries = await (
    await coll()
  )
    .find({ date: { $regex: `^${month}` } })
    .sort({ date: 1, createdAt: 1 })
    .toArray();
  return NextResponse.json({
    entries: entries.map((e) => ({ ...e, _id: String(e._id) })),
  });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as {
    date?: string;
    name?: string;
    amount?: number | string;
    note?: string;
  };
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || !(amount > 0))
    return NextResponse.json(
      { error: "Enter a date and an amount" },
      { status: 400 },
    );
  const doc: CashPayrollDoc = {
    date: b.date!,
    name: String(b.name || "")
      .trim()
      .slice(0, 80),
    amount,
    note: String(b.note || "")
      .trim()
      .slice(0, 200),
    createdAt: new Date(),
  };
  const r = await (await coll()).insertOne(doc);
  return NextResponse.json({ success: true, id: String(r.insertedId) });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !ObjectId.isValid(id))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await (await coll()).deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ success: true });
}