// app/api/fax/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { faxId } = await request.json();
    if (!faxId) {
      return NextResponse.json({ error: "faxId is required" }, { status: 400 });
    }

    const client = await connectToDatabase;
    const collection = client.db("db").collection("texas_premium_faxes");

    // Soft delete — the Azure blob and RC's own copy stay put, so a
    // mistaken delete is recoverable.
    const result = await collection.updateOne(
      { id: faxId },
      { $set: { deleted: true, deletedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Fax not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to delete" },
      { status: 500 },
    );
  }
}