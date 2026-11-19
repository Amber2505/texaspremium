// app/api/document-requests/[id]/route.ts
// DELETE ?code=… removes the request and every uploaded file.
// Uses the same admin delete code as Guides.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/mongodb";
import { docsContainer, requestsCollection } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Same code as Guides: data_login → "guides" field
    const code = req.nextUrl.searchParams.get("code") || "";
    const client = await connectToDatabase;
    const creds = await client
      .db("db")
      .collection("data_login")
      .findOne({ _id: new ObjectId("6a295793d14cfdba53c65fa0") });
    if (!creds || !code.trim() || String(creds.guides).trim() !== code.trim()) {
      return NextResponse.json({ error: "Incorrect code" }, { status: 403 });
    }

    const col = await requestsCollection();
    const doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Every file for this request lives under "<id>/" in the private container
    const container = docsContainer();
    for await (const blob of container.listBlobsFlat({ prefix: `${id}/` })) {
      await container.deleteBlob(blob.name, { deleteSnapshots: "include" }).catch(() => {});
    }

    await col.deleteOne({ _id: doc._id });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete document request error:", e);
    return NextResponse.json({ error: "Couldn't delete." }, { status: 500 });
  }
}