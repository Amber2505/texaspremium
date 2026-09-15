// app/api/fax/mark-read/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { faxId, all } = await request.json();

    const client = await connectToDatabase;
    const collection = client.db("db").collection("texas_premium_faxes");

    if (all) {
      const result = await collection.updateMany(
        { direction: "Inbound", readStatus: "Unread" },
        { $set: { readStatus: "Read" } },
      );
      return NextResponse.json({ success: true, updated: result.modifiedCount });
    }

    if (!faxId) {
      return NextResponse.json({ error: "faxId is required" }, { status: 400 });
    }

    const result = await collection.updateOne(
      { id: faxId },
      { $set: { readStatus: "Read" } },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Fax not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ Fax mark-read error:", error);
    return NextResponse.json(
      { error: err.message || "Failed to mark read" },
      { status: 500 },
    );
  }
}