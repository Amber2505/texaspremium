// app/api/accounting/import/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { receipts } = await request.json();
    if (!receipts?.length) {
      return NextResponse.json({ error: "No receipts provided" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("db");
    const col = db.collection("accounting_info");

    let inserted = 0;
    let updated = 0;

    for (const receipt of receipts) {
      // Upsert by receiptNo + custId — safe to re-import same CSV
      const filter = {
        receiptNo: receipt.receiptNo,
        custId: receipt.custId,
        dateKey: receipt.dateKey,
      };
      const result = await col.updateOne(
        filter,
        {
          $set: {
            ...receipt,
            importedAt: new Date(),
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) inserted++;
      else if (result.modifiedCount) updated++;
    }

    return NextResponse.json({ inserted, updated, total: receipts.length });
  } catch (error) {
    console.error("Accounting import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}