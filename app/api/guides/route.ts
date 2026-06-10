// app/api/guides/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { BlobServiceClient } from "@azure/storage-blob";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

async function getCollection() {
  await mongoClient.connect();
  return mongoClient.db("db").collection("admin_guides");
}

// GET /api/guides
export async function GET() {
  try {
    const col = await getCollection();
    const guides = await col.find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ guides });
  } catch {
    return NextResponse.json({ error: "Failed to fetch guides" }, { status: 500 });
  }
}

// POST /api/guides — multipart: title, description, category, duration, video (file)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const title       = formData.get("title") as string;
    const description = (formData.get("description") as string) ?? "";
    const category    = (formData.get("category") as string) ?? "General";
    const duration    = (formData.get("duration") as string) ?? "";
    const videoFile   = formData.get("video") as File | null;

    if (!title || !videoFile) {
      return NextResponse.json({ error: "Title and video are required." }, { status: 400 });
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const col = await getCollection();
    if (await col.findOne({ slug })) {
      return NextResponse.json({ error: "A guide with that title already exists." }, { status: 409 });
    }

    // Upload to Azure
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    );
    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_GUIDES_CONTAINER ?? "guides"
    );
    await containerClient.createIfNotExists({ access: "blob" });

    const ext = videoFile.name.split(".").pop() ?? "mp4";
    const blobName = `${slug}-${Date.now()}.${ext}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const buffer = Buffer.from(await videoFile.arrayBuffer());
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: videoFile.type || "video/mp4" },
    });

    const doc = {
      slug,
      title,
      description,
      category,
      duration,
      videoUrl: blockBlobClient.url,
      blobName,
      createdAt: new Date(),
    };

    await col.insertOne(doc);
    return NextResponse.json({ guide: doc });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "Upload failed." }, { status: 500 });
  }
}