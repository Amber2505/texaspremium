import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: "No code provided" });
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("texas_autopay_security");

    const activeCode = await collection.findOne(
      { type: "daily_code" },
      { sort: { generatedAt: -1 } }
    );

    if (!activeCode) {
      return NextResponse.json({ valid: false, error: "No active code found" });
    }

    const isValid = activeCode.code === code;
    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error("Error verifying security code:", error);
    return NextResponse.json({ valid: false, error: "Verification failed" }, { status: 500 });
  } finally {
    if (client) await client.close();
  }
}