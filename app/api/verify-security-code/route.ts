// app/api/verify-security-code/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { setAdminSession } from "@/lib/adminAuth";

const uri = process.env.MONGODB_URI!;



export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const { code, username } = await request.json();

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

    if (activeCode.code !== code) {
      return NextResponse.json({ valid: false });
    }

        // ✅ Code verified — signed httpOnly cookie until 11:59 PM Central
    return setAdminSession(
      NextResponse.json({ valid: true }),
      String(username || "admin").trim(),
    );
  } catch (error) {
    console.error("Error verifying security code:", error);
    return NextResponse.json(
      { valid: false, error: "Verification failed" },
      { status: 500 }
    );
  } finally {
    if (client) await client.close();
  }
}