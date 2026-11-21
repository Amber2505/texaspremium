// app/api/document-requests/[id]/complete/route.ts
// Agent marks a request done (or undoes it). Done = moves to Completed and
// the customer stops getting reminder texts.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requestsCollection } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const col = await requestsCollection();
    const update = body.undo
      ? { $set: { completedAt: null, completedBy: null } }
      : {
          $set: {
            completedAt: new Date(),
            completedBy: body.by ? String(body.by).slice(0, 60) : null,
            lastViewedAt: new Date(),
          },
        };
    const res = await col.updateOne({ _id: new ObjectId(id) }, update);
    if (!res.matchedCount)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Complete document request error:", e);
    return NextResponse.json(
      { error: "Couldn't update the request." },
      { status: 500 },
    );
  }
}