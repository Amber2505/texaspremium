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
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const col = await getCollection();
    const guide = await col.findOne({ slug });

    if (guide?.blobName) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING!
      );
      const containerClient = blobServiceClient.getContainerClient(
        process.env.AZURE_GUIDES_CONTAINER ?? "guides"
      );
      await containerClient.getBlockBlobClient(guide.blobName).deleteIfExists();
    }

    await col.deleteOne({ slug });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}