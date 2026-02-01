// app/api/payment-link-history/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function GET() {
  let client: MongoClient | null = null;

  try {
    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Fetch all links, sorted by most recent first
    const links = await collection
      .find({})
      .sort({ createdAtTimestamp: -1 })
      .limit(100) // Limit to last 100 links
      .toArray();

    return NextResponse.json({
      success: true,
      links,
    });
  } catch (error: unknown) {
    console.error("Error fetching payment link history:", error);
    return NextResponse.json(
      { error: "Failed to fetch link history" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}