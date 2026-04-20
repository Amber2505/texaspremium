// lib/adminAuth.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface SessionPayload {
  username: string;
  expiresAt: number;
}

/**
 * Verify the admin_auth cookie's signature and expiry.
 * Returns the payload if valid, or null if invalid/expired/missing.
 */
export function verifyAdminSession(request: NextRequest | Request): SessionPayload | null {
  try {
    // Extract cookie — handle both NextRequest and standard Request
    let cookieValue: string | undefined;
    if ("cookies" in request && typeof (request as NextRequest).cookies?.get === "function") {
      cookieValue = (request as NextRequest).cookies.get("admin_auth")?.value;
    } else {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/(?:^|;\s*)admin_auth=([^;]+)/);
      cookieValue = match ? decodeURIComponent(match[1]) : undefined;
    }

    if (!cookieValue) return null;

    const [dataB64, sig] = cookieValue.split(".");
    if (!dataB64 || !sig) return null;

    // Recompute HMAC and compare — timing-safe to prevent timing attacks
    const expectedSig = crypto
      .createHmac("sha256", process.env.ADMIN_SECRET_KEY!)
      .update(dataB64)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    // Signature valid — parse payload
    const payload = JSON.parse(
      Buffer.from(dataB64, "base64url").toString("utf-8")
    ) as SessionPayload;

    // Check expiry
    if (Date.now() >= payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Helper: returns a 401 response if session is invalid.
 * Use in route handlers:
 *   const authCheck = requireAdmin(request);
 *   if (authCheck) return authCheck;
 */
export function requireAdmin(request: NextRequest | Request): NextResponse | null {
  const session = verifyAdminSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized — please log in again" },
      { status: 401 }
    );
  }
  return null;
}