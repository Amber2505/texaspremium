import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export const runtime = "nodejs";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password) return NextResponse.json({ valid: false });

    await mongoClient.connect();
    const creds = await mongoClient
      .db("db")
      .collection("data_login")
      .findOne({ _id: new ObjectId("6a295793d14cfdba53c65fa0") });

    const valid =
      !!creds && String(creds.admin).trim() === String(password).trim();

    return NextResponse.json({ valid });
  } catch (error) {
    console.error("verify-admin-password error:", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}