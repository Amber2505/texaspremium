import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    await client.connect();
    const creds = await client.db("db").collection("data_login").findOne({
      _id: new ObjectId("6a295793d14cfdba53c65fa0"),
    });
    if (!creds || String(creds.accounting).trim() !== String(code).trim()) {
      return NextResponse.json({ error: "Invalid code" }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}