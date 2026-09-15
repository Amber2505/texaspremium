// app/api/fax/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const direction = searchParams.get("direction") || "all"; // all|inbound|outbound
    const search = searchParams.get("search")?.trim() || "";
    const limit = Math.min(
      PAGE_SIZE,
      parseInt(searchParams.get("limit") || String(PAGE_SIZE), 10),
    );
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

    const client = await connectToDatabase;
    const collection = client.db("db").collection("texas_premium_faxes");

    // Soft-deleted faxes must not come back in the list.
    const query: Record<string, unknown> = { deleted: { $ne: true } };
    if (direction === "inbound") query.direction = "Inbound";
    if (direction === "outbound") query.direction = "Outbound";

    if (search) {
      const esc = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const digits = search.replace(/\D/g, "");
      const or: Record<string, unknown>[] = [
        { "attachments.filename": { $regex: esc, $options: "i" } },
        { coverPageText: { $regex: esc, $options: "i" } },
        { contactName: { $regex: esc, $options: "i" } },
      ];
      if (digits) {
        or.push({ from: { $regex: digits } });
        or.push({ to: { $regex: digits } });
      }
      query.$or = or;
    }

    const [faxes, total, unread] = await Promise.all([
      collection
        .find(query)
        .sort({ creationTime: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
      collection.countDocuments({
        direction: "Inbound",
        readStatus: "Unread",
        deleted: { $ne: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      faxes,
      total,
      unread,
      hasMore: skip + faxes.length < total,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ Fax list error:", error);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load faxes" },
      { status: 500 },
    );
  }
}
