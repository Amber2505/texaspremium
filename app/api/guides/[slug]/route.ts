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