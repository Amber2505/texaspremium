// app/api/pdf-extracted-all/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("cluster0");
    const records = await db
      .collection("pdf-extracted")
      .find({}, { projection: { policyNo: 1, customerName: 1, nextDueDate: 1, paidInFull: 1, paymentMethod: 1, suggestedPaymentType: 1, paidAmount: 1, updatedAt: 1 } })
      .toArray();
    return NextResponse.json(records);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}