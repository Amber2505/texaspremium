// app/api/save-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import crypto from "crypto";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const {
      linkType,
      amount,
      description,
      customerPhone,
      paymentMethod,
      language,
      generatedLink,
      squareLink,
    } = body;

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // ✅ Generate cryptographically random public ID (32-char hex = 128 bits of entropy)
    // Unguessable — cannot be enumerated by tweaking characters
    const publicLinkId = crypto.randomBytes(16).toString("hex");

    const linkRecord = {
      publicLinkId, // ✅ Used in public-facing URLs
      linkType,
      amount: amount || null,
      description: description || null,
      customerPhone,
      paymentMethod,
      language,
      generatedLink,
      squareLink: squareLink || null,
      disabled: false,
      createdAt: new Date(),
      createdAtTimestamp: Date.now(),
      currentStage: null,
      completedStages: {},
      timestamps: {},
      lastUpdated: new Date().toISOString(),
    };

    const result = await collection.insertOne(linkRecord);

    return NextResponse.json({
      success: true,
      message: "Link saved to history",
      linkId: publicLinkId, // ✅ Return the secure public ID (not _id)
      mongoId: result.insertedId.toString(), // For admin-side reference if needed
    });
  } catch (error: unknown) {
    console.error("Error saving payment link:", error);
    return NextResponse.json(
      { error: "Failed to save link to history" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}