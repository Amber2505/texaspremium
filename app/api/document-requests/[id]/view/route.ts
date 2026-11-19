// app/api/document-requests/[id]/view/route.ts
// Returns the files with 15-minute view links + download links.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requestsCollection, signedReadUrl } from "@/lib/documentRequests";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

// Download file names must be plain ASCII: "Maria Lopez - Photos - 2015 Nissan Altima - Driver side.jpg"
const ascii = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—/]/g, "-")
    .replace(/[^A-Za-z0-9 ._()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
        slots: i.slots.map((s) => ({
          key: s.key,
          label: s.labelEn,
          files: s.files.map((f, n) => {
            const ext =
              EXT[f.contentType] || f.originalName.split(".").pop()?.toLowerCase() || "jpg";
            const parts = [doc.customerName, i.labelEn, s.key !== "files" ? s.labelEn : ""].filter(Boolean);
            const downloadName = `${ascii(parts.join(" - "))}${s.files.length > 1 ? ` (${n + 1})` : ""}.${ext}`;
            return {
              id: f.id,
              name: f.originalName,
              contentType: f.contentType,
              size: f.size,
              uploadedAt: f.uploadedAt,
              url: signedReadUrl(f.blobName),
              downloadUrl: signedReadUrl(f.blobName, 15, downloadName),
            };
          }),
        })),
      })),
    });
  } catch (e) {
    console.error("View documents error:", e);
    return NextResponse.json({ error: "Couldn't load documents." }, { status: 500 });
  }
}