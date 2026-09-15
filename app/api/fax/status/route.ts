// app/api/fax/status/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { SDK } from "@ringcentral/sdk";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

// A fresh JWT login per request is what was tripping "Request rate exceeded" —
// the auth endpoint is limited far more tightly than the data endpoints.
// Module scope survives across invocations on a warm lambda.
let cachedPlatform: any = null;
let cachedExpiry = 0;
// RC returns retryAfter: 60000 on a rate-limit block. Every request we make
// during that window resets it, so the block never expires. Refuse locally.
let blockedUntil = 0;

async function getCachedPlatform() {
  if (cachedPlatform && Date.now() < cachedExpiry) return cachedPlatform;
  const rcsdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });
  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  cachedPlatform = platform;
  cachedExpiry = Date.now() + 30 * 60 * 1000;
  return platform;
}

export async function POST(request: NextRequest) {
  try {
    const { faxId } = await request.json();
    if (!faxId) {
      return NextResponse.json({ error: "faxId is required" }, { status: 400 });
    }

    const client = await connectToDatabase;
    const collection = client.db("db").collection("texas_premium_faxes");
    const fax = await collection.findOne({ id: faxId });
    if (!fax) {
      return NextResponse.json({ error: "Fax not found" }, { status: 404 });
    }

    // Terminal states don't change — skip the RC call entirely.
    if (["Delivered", "SendingFailed", "DeliveryFailed"].includes(fax.status)) {
      return NextResponse.json({ success: true, status: fax.status, final: true });
    }

    // Hard stop while RC has us blocked — hitting them again extends it.
    if (Date.now() < blockedUntil) {
      return NextResponse.json(
        {
          error: "Rate limited",
          rateLimited: true,
          retryAfter: Math.ceil((blockedUntil - Date.now()) / 1000),
        },
        { status: 429 },
      );
    }

    const platform = await getCachedPlatform();

    const res = await platform.get(
      `/restapi/v1.0/account/~/extension/~/message-store/${fax.rcMessageId}`,
    );
    const msg = await res.json();

    const status = msg.messageStatus || fax.status;
    // RC reports per-recipient failure detail on the `to` entry, not the root.
    const failed = status === "SendingFailed" || status === "DeliveryFailed";
    const errorMessage = failed
      ? msg.to?.[0]?.messageStatus ||
        msg.to?.[0]?.faxErrorCode ||
        "Delivery failed"
      : null;

    if (status !== fax.status) {
      await collection.updateOne(
        { id: faxId },
        {
          $set: {
            status,
            errorMessage,
            pageCount: msg.faxPageCount || fax.pageCount || 0,
            lastModifiedTime: msg.lastModifiedTime || fax.lastModifiedTime,
          },
        },
      );
      console.log(`📠 ${faxId}: ${fax.status} → ${status}`);
    }

    return NextResponse.json({
      success: true,
      status,
      errorMessage,
      final: ["Delivered", "SendingFailed", "DeliveryFailed"].includes(status),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ Fax status check failed:", err.message);
    if (/rate exceeded|rate limit|429/i.test(err.message || "")) {
      // 90s > RC's 60s window, so we're clear when we resume.
      blockedUntil = Date.now() + 90_000;
      cachedPlatform = null;
      cachedExpiry = 0;
      console.warn("⏸️ Fax status checks paused 90s — RC rate limit");
      return NextResponse.json(
        { error: "Rate limited", rateLimited: true, retryAfter: 90 },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: err.message || "Status check failed" },
      { status: 500 },
    );
  }
}