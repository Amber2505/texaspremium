import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export const runtime = "nodejs";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ valid: false });

    await mongoClient.connect();
    const creds = await mongoClient
      .db("db")
      .collection("data_login")
      .findOne({ _id: new ObjectId("6a295793d14cfdba53c65fa0") });

    // Reuses the accounting code — same doc the guides delete flow reads.
    const valid =
      !!creds && String(creds.accounting).trim() === String(code).trim();

    return NextResponse.json({ valid });
  } catch (error) {
    console.error("verify-call-code error:", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}