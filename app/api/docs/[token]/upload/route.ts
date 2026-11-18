// app/api/docs/[token]/upload/route.ts
// Public: customer uploads one file into one slot.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  allUploaded,
  deleteBlobQuietly,
  docsContainer,
  MAX_FILES_PER_SLOT,
  MAX_UPLOAD_BYTES,
  notifyRailway,
  requestsCollection,
  toPublic,
  type DocFile,
} from "@/lib/documentRequests";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const form = await req.formData();
    const itemId = String(form.get("itemId") || "");
    const slotKey = String(form.get("slot") || "");
    const file = form.get("file");

    if (!(file instanceof Blob) || !itemId || !slotKey) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const col = await requestsCollection();
    const doc = await col.findOne({ token });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (new Date(doc.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    const item = doc.items.find((i) => i.id === itemId);
    const slot = item?.slots.find((s) => s.key === slotKey);
    if (!item || !slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.review === "accepted") return NextResponse.json({ error: "locked" }, { status: 409 });

    const type = (file.type || "").toLowerCase();
    const isImage = type.startsWith("image/");
    const isPdf = type === "application/pdf";
    if (!isImage && !(isPdf && !slot.imagesOnly)) {
      return NextResponse.json({ error: "bad_type" }, { status: 415 });
    }
    if (!slot.single && slot.files.length >= MAX_FILES_PER_SLOT) {
      return NextResponse.json({ error: "too_many" }, { status: 409 });
    }

    const fileId = randomBytes(6).toString("base64url");
    const ext = EXT[type] || (isPdf ? "pdf" : "jpg");
    const blobName = `${doc._id!.toString()}/${item.id}/${slot.key}/${Date.now()}-${fileId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await docsContainer()
      .getBlockBlobClient(blobName)
      .uploadData(buffer, { blobHTTPHeaders: { blobContentType: type || "application/octet-stream" } });

    const rawName = file instanceof File ? file.name : "";
    const entry: DocFile = {
      id: fileId,
      blobName,
      originalName: (rawName || `${slot.key}.${ext}`).slice(0, 120),
      contentType: type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    const now = new Date();
    const filesPath = "items.$[i].slots.$[s].files";
    const update: any = slot.single
      ? { $set: { [filesPath]: [entry], lastUploadAt: now } }
      : { $push: { [filesPath]: entry }, $set: { lastUploadAt: now } };

    const updated = await col.findOneAndUpdate({ _id: doc._id }, update, {
      arrayFilters: [{ "i.id": item.id }, { "s.key": slot.key }],
      returnDocument: "after",
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // A replaced single-photo slot leaves the old blob behind — remove it
    if (slot.single) for (const old of slot.files) await deleteBlobQuietly(old.blobName);

    let finalDoc = updated;
    if (allUploaded(updated) && !updated.allReceivedAt) {
      // Conditional so two last-uploads at the same moment only text once
      const claimed = await col.findOneAndUpdate(
        { _id: updated._id, allReceivedAt: null },
        { $set: { allReceivedAt: now } },
        { returnDocument: "after" },
      );
      if (claimed) {
        finalDoc = claimed;
        await notifyRailway("/notify/documents-received", { requestId: updated._id!.toString() });
      }
    }

    // Sidebar badge. One notification per request per 10 minutes, not per photo.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    await notifyRailway("/notify/admin", {
      section: "documents",
      title: "Documents uploaded",
      body: `${doc.customerName} uploaded documents`,
      eventId: `docs-${doc._id!.toString()}-${bucket}`,
    });

    return NextResponse.json({ success: true, request: toPublic(finalDoc) });
  } catch (e) {
    console.error("Public docs upload error:", e);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}