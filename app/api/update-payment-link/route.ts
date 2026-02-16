import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const { linkId, generatedLink, squareLink, squareTransactionId } = body;

    if (!linkId) {
      return NextResponse.json(
        { error: "Link ID is required" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Build update object dynamically
    const updateFields: Record<string, string> = {};
    if (generatedLink) updateFields.generatedLink = generatedLink;
    if (squareLink) updateFields.squareLink = squareLink;
    if (squareTransactionId) updateFields.squareTransactionId = squareTransactionId;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(linkId) },
      { $set: updateFields }
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