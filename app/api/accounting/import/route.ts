// app/api/accounting/import/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { receipts } = await request.json();
    if (!receipts?.length) {
      return NextResponse.json(
        { error: "No receipts provided" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("db");
    const col = db.collection("accounting_info");

    let inserted = 0;
    let deleted = 0;

    // Get all unique dateKeys present in this upload
    const uploadedDateKeys = [...new Set(receipts.map((r: any) => r.dateKey))];

    // Delete ALL existing records for those dates — full replace per day
    const deleteResult = await col.deleteMany({
      dateKey: { $in: uploadedDateKeys },
    });
    deleted = deleteResult.deletedCount;

    // Insert all receipts fresh
    if (receipts.length > 0) {
      const toInsert = receipts.map((r: any) => ({
        ...r,
        importedAt: new Date(),
      }));
      const insertResult = await col.insertMany(toInsert);
      inserted = insertResult.insertedCount;
    }

    return NextResponse.json({
      inserted,
      deleted,
      total: receipts.length,
    });
  } catch (error) {
    console.error("Accounting import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}