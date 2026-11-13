// app/api/accounting/manual-matches/route.ts
// Staff-confirmed links: "this CSV receipt was paid by these Square payments"
// (split across several cards). The reconciliation treats them as matched.
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type ManualMatchDoc = {
  _id: string; // `${receiptNo}_${dateKey}`
  receiptNo: string;
  dateKey: string;
  customer: string;
  amount: number;
  squarePaymentIds: string[];
  createdAt: Date;
};

async function coll() {
  return (await clientPromise)
    .db("db")
    .collection<ManualMatchDoc>("accounting_manual_matches");
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 });
  }
  const matches = await (await coll())
    .find({ dateKey: { $regex: `^${month}` } })
    .toArray();
  return NextResponse.json({ matches });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { receiptNo, dateKey, customer, amount, squarePaymentIds } = body as {
    receiptNo?: string;
    dateKey?: string;
    customer?: string;
    amount?: number;
    squarePaymentIds?: string[];
  };
  if (
    !receiptNo ||
    !dateKey ||
    !Array.isArray(squarePaymentIds) ||
    squarePaymentIds.length === 0
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const _id = `${receiptNo}_${dateKey}`;
  await (await coll()).updateOne(
    { _id },
    {
      $set: {
        receiptNo,
        dateKey,
        customer: customer || "",
        amount: Number(amount) || 0,
        squarePaymentIds: squarePaymentIds.map(String),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return NextResponse.json({ success: true, id: _id });
}

export async function DELETE(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await (await coll()).deleteOne({ _id: id });
  return NextResponse.json({ success: true });
}