import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Default: return everything. Pass ?limit=N to cap, ?since=YYYY-MM-DD to filter.
    const limit = parseInt(searchParams.get("limit") || "0", 10);
    const since = searchParams.get("since");

    const filter: Record<string, unknown> = {};
    if (since) filter.date = { $gte: since };

    const client = await clientPromise;
    const cursor = client
      .db("db")
      .collection("bank_transactions")
      .find(filter)
      .sort({ date: -1 });

    if (limit > 0) cursor.limit(limit);

    const transactions = await cursor.toArray();
    return NextResponse.json({ transactions });
  } catch (err) {
    console.error("transactions read error:", err);
    return NextResponse.json({ transactions: [] });
  }
}