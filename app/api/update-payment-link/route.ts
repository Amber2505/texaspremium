// app/api/update-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const { linkId, generatedLink } = body;

    if (!linkId || !generatedLink) {
      return NextResponse.json(
        { error: "Link ID and generated link are required" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Update the generatedLink field
    const result = await collection.updateOne(
      { _id: new ObjectId(linkId) },
      { $set: { generatedLink: generatedLink } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Link updated successfully",
    });
  } catch (error: unknown) {
    console.error("Error updating payment link:", error);
    return NextResponse.json(
      { error: "Failed to update link" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}