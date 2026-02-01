// app/api/save-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

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
      squareLink, // ✅ Store the actual Square link separately
    } = body;

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    const linkRecord = {
      linkType,
      amount: amount || null,
      description: description || null,
      customerPhone,
      paymentMethod,
      language,
      generatedLink, // Our proxy link (e.g., /pay/123abc)
      squareLink: squareLink || null, // ✅ Actual Square payment link
      disabled: false,
      createdAt: new Date(),
      createdAtTimestamp: Date.now(),
    };

    const result = await collection.insertOne(linkRecord);

    return NextResponse.json({
      success: true,
      message: "Link saved to history",
      linkId: result.insertedId.toString(), // ✅ Return the MongoDB ID
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