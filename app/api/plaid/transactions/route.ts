import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const transactions = await client
      .db("db")
      .collection("bank_transactions")
      .find({})
      .sort({ date: -1 })
      .limit(200)
      .toArray();
    return NextResponse.json({ transactions });
  } catch {
    return NextResponse.json({ transactions: [] });
  }
}