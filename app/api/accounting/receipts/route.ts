// app/api/accounting/receipts/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateKey = searchParams.get("dateKey"); // optional filter
    const month = searchParams.get("month"); // e.g. "2026-05"

    const client = await clientPromise;
    const db = client.db("db");

    const query: Record<string, unknown> = {};
    if (dateKey) {
      query.dateKey = dateKey;
    } else if (month) {
      // e.g. month = "2026-05" → match all dateKeys starting with that
      query.dateKey = { $regex: `^${month}` };
    }

    const receipts = await db
      .collection("accounting_info")
      .find(query)
      .sort({ dateKey: 1, receiptNo: 1 })
      .toArray();

    return NextResponse.json(
      receipts.map((r) => ({ ...r, _id: r._id.toString() }))
    );
  } catch (error) {
    console.error("Accounting fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}