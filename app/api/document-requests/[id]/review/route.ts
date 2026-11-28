// app/api/document-requests/[id]/review/route.ts
// Internal Accept / Reject marker. Sends nothing to the customer — the agent
// follows up personally.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requestsCollection } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { itemId, review, note, by } = await req.json().catch(() => ({}));
    if (!itemId || !["accepted", "rejected", null].includes(review)) {
      return NextResponse.json({ error: "itemId and review are required." }, { status: 400 });
    }

    const col = await requestsCollection();
    const result = await col.updateOne(
      { _id: new ObjectId(id), "items.id": String(itemId) },
      {
        $set: {
          "items.$.review": review,
          "items.$.reviewNote": review === "rejected" && note ? String(note).slice(0, 200) : null,
          "items.$.reviewedBy": review ? (by ? String(by).slice(0, 60) : null) : null,
          "items.$.reviewedAt": review ? new Date() : null,
        },
      },
    );
    if (!result.matchedCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Review error:", e);
    return NextResponse.json({ error: "Couldn't save review." }, { status: 500 });
  }
}