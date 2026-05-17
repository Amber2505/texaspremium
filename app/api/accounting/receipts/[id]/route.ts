// app/api/accounting/receipts/[id]/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const client = await clientPromise;
    const db = client.db("db");

    // body can contain: rows, notes, or any top-level field
    // Recalculate totals if rows are updated
    const update: Record<string, unknown> = { ...body, updatedAt: new Date() };

    if (body.rows) {
      update.totalPremium = body.rows.reduce(
        (s: number, r: { premium: number }) => s + (r.premium || 0), 0
      );
      update.totalFees = body.rows.reduce(
        (s: number, r: { fees: number }) => s + (r.fees || 0), 0
      );
      update.totalAmount = (update.totalPremium as number) + (update.totalFees as number);
      update.methods = [
        ...new Set(body.rows.map((r: { method: string }) => r.method)),
      ];
    }

    const result = await db.collection("accounting_info").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (!result.matchedCount) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Accounting edit error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}