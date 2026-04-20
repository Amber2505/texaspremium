// app/api/verify-security-code/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import crypto from "crypto";

const uri = process.env.MONGODB_URI!;

// Sign a session token using HMAC-SHA256 — unforgeable without the secret
function signSessionToken(payload: { username: string; expiresAt: number }): string {
  const data = JSON.stringify(payload);
  const dataB64 = Buffer.from(data).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.ADMIN_SECRET_KEY!)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${sig}`;
}

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

    // ✅ Code verified — sign a session token and set httpOnly cookie
    // Expires at 11:59 PM today (matches your existing session behavior)
    const now = new Date();
    const endOfDay = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      23, 59, 59, 999
    );
    const expiresAt = endOfDay.getTime();

    const token = signSessionToken({
      username: (username || "admin").trim(),
      expiresAt,
    });

    const response = NextResponse.json({ valid: true });

    response.cookies.set({
      name: "admin_auth",
      value: token,
      httpOnly: true,                                  // ✅ JS cannot read this
      secure: process.env.NODE_ENV === "production",   // HTTPS only in prod
      sameSite: "lax",                                 // sent on same-site navigations
      path: "/",
      expires: endOfDay,
    });

    return response;
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