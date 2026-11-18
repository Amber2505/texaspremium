// app/api/document-requests/[id]/reopen/route.ts
// Opens the same link for another 10 days and restarts the reminder schedule
// (reminders still only go out while something is missing).
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { LINK_DAYS, requestsCollection } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000);
    const col = await requestsCollection();
    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { expiresAt, reopenedAt: now, sentReminders: [] } },
    );
    if (!result.matchedCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, expiresAt });
  } catch (e) {
    console.error("Reopen error:", e);
    return NextResponse.json({ error: "Couldn't reopen." }, { status: 500 });
  }
}