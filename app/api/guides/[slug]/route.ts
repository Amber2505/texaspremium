// app/api/guides/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { BlobServiceClient } from "@azure/storage-blob";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

async function getCollection() {
  await mongoClient.connect();
  return mongoClient.db("db").collection("admin_guides");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const col = await getCollection();
    const guide = await col.findOne({ slug });
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ guide });
  } catch {
    return NextResponse.json({ error: "Failed to fetch guide" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
  ) {
  const { slug } = await params;
  try {
    const code = new URL(req.url).searchParams.get("code") || "";
    const col = await getCollection(); // connects the client first
    const { ObjectId } = await import("mongodb");
    const creds = await mongoClient.db("db").collection("data_login").findOne({ _id: new ObjectId("6a295793d14cfdba53c65fa0") });
    if (!creds || String(creds.guides).trim() !== code.trim()) {
      return NextResponse.json({ error: "Invalid code" }, { status: 403 });
    }

    const guide = await col.findOne({ slug });

    if (guide?.blobName || (guide?.pages && guide.pages.length > 0)) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING!
      );
      const containerClient = blobServiceClient.getContainerClient(
        process.env.AZURE_GUIDES_CONTAINER ?? "guides"
      );

      // Single-file guides (video/pdf) store one blobName
      if (guide.blobName) {
        await containerClient.getBlockBlobClient(guide.blobName).deleteIfExists();
      }

      // pdf-steps guides store an array of page image URLs — delete each one
      if (Array.isArray(guide.pages)) {
        for (const pg of guide.pages) {
          if (!pg?.image) continue;
          // Blob name is the last path segment of the URL
          const blobName = decodeURIComponent(
            new URL(pg.image).pathname.split("/").pop() || ""
          );
          if (blobName) {
            await containerClient.getBlockBlobClient(blobName).deleteIfExists();
          }
        }
      }
    }

    await col.deleteOne({ slug });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json();

    const col = await getCollection(); // db.admin_guides — same as GET/DELETE

  const existing = await col.findOne({ slug });
  if (!existing) {
    return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (str(body.title)) update.title = str(body.title);
  if (typeof body.description === "string") {
    update.description = str(body.description);
  }

  if (Array.isArray(body.steps)) {
    update.steps = body.steps.map((s: any) => ({
      title: str(s?.title),
      description: str(s?.description),
    }));
  }

  // Merge by index against the stored pages so `image` is preserved —
  // the client never sends image URLs.
  if (Array.isArray(body.pages) && Array.isArray(existing.pages)) {
    update.pages = existing.pages.map((p: any, i: number) => ({
      ...p,
      title: str(body.pages[i]?.title) || p.title,
      description:
        typeof body.pages[i]?.description === "string"
          ? str(body.pages[i].description)
          : p.description,
    }));
  }

  await col.updateOne({ slug }, { $set: update });
  return NextResponse.json({ ok: true });
}