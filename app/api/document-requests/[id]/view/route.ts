// app/api/document-requests/[id]/view/route.ts
// Returns the files with 15-minute view links. Requires today's 4-digit code.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requestsCollection, signedReadUrl, verifyDailyCode } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { code } = await req.json().catch(() => ({}));
    if (!(await verifyDailyCode(code))) {
      return NextResponse.json({ error: "Invalid security code." }, { status: 401 });
    }

    const col = await requestsCollection();
    const doc = await col.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { lastViewedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      success: true,
      items: doc.items.map((i) => ({
        id: i.id,
        label: i.labelEn,
        review: i.review,
        reviewNote: i.reviewNote || null,
        reviewedBy: i.reviewedBy || null,
        slots: i.slots.map((s) => ({
          key: s.key,
          label: s.labelEn,
          files: s.files.map((f) => ({
            id: f.id,
            name: f.originalName,
            contentType: f.contentType,
            size: f.size,
            uploadedAt: f.uploadedAt,
            url: signedReadUrl(f.blobName),
          })),
        })),
      })),
    });
  } catch (e) {
    console.error("View documents error:", e);
    return NextResponse.json({ error: "Couldn't load documents." }, { status: 500 });
  }
}