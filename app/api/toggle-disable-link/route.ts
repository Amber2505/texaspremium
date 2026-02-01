// app/api/toggle-disable-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const { linkId, disabled } = body;

    if (!linkId) {
      return NextResponse.json(
        { error: "Link ID is required" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Update the disabled status
    const result = await collection.updateOne(
      { _id: new ObjectId(linkId) },
      { $set: { disabled: disabled, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Link ${disabled ? "disabled" : "enabled"} successfully`,
    });
  } catch (error: unknown) {
    console.error("Error toggling link status:", error);
    return NextResponse.json(
      { error: "Failed to update link status" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}