import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const col = client.db("db").collection("quote-history");
    const quotes = await col
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = await clientPromise;
    const col = client.db("db").collection("quote-history");
    const doc = {
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerAddress: body.customerAddress,
      vehicles: body.vehicles,
      paidInFull: body.totals?.paidInFull,
      downPayment: body.downPayment,
      term: body.term,
      status: "active",
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return NextResponse.json({ id: result.insertedId });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}