// app/api/guides/upload-url/route.ts
//
// Issues a short-lived, write-only SAS URL so the browser can PUT a file
// (PDF or video) DIRECTLY to Azure Blob Storage — completely bypassing this
// Next.js server. This exists because Vercel Serverless Functions enforce a
// hard ~4.5MB request-body limit at the platform level; any PDF or video
// bigger than that returns a 413 before /api/guides ever runs. Routing the
// big bytes straight to Azure removes that ceiling entirely.

import { NextRequest, NextResponse } from "next/server";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!,
    );
    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_GUIDES_CONTAINER ?? "guides",
    );
    await containerClient.createIfNotExists({ access: "blob" });

    // Connection-string auth gives us a shared-key credential directly —
    // this is what signs the SAS token below.
    const credential = blobServiceClient.credential as StorageSharedKeyCredential;

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const blobName = `uploads/${randomUUID()}.${ext}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 min is plenty for one upload

    const sas = generateBlobSASQueryParameters(
      {
        containerName: containerClient.containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"), // create + write only
        expiresOn,
      },
      credential,
    ).toString();

    return NextResponse.json({
      uploadUrl: `${blockBlobClient.url}?${sas}`,
      blobName,
    });
  } catch (err) {
    console.error("upload-url error:", err);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 },
    );
  }
}