// app/api/docs/[token]/remove/route.ts
// Public: customer removes a file they uploaded by mistake (not once the agent
// has accepted that item).
import { NextRequest, NextResponse } from "next/server";
import { deleteBlobQuietly, requestsCollection, toPublic } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { itemId, slot: slotKey, fileId } = await req.json().catch(() => ({}));

    const col = await requestsCollection();
    const doc = await col.findOne({ token });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (new Date(doc.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    const item = doc.items.find((i) => i.id === itemId);
    const slot = item?.slots.find((s) => s.key === slotKey);
    const file = slot?.files.find((f) => f.id === fileId);
    if (!item || !slot || !file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.review === "accepted") return NextResponse.json({ error: "locked" }, { status: 409 });

    const updated = await col.findOneAndUpdate(
      { _id: doc._id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $pull: { "items.$[i].slots.$[s].files": { id: file.id } } } as any,
      { arrayFilters: [{ "i.id": item.id }, { "s.key": slot.key }], returnDocument: "after" },
    );
    await deleteBlobQuietly(file.blobName);

    return NextResponse.json({ success: true, request: toPublic(updated ?? doc) });
  } catch (e) {
    console.error("Public docs remove error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}