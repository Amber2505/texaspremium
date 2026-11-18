// app/api/docs/[token]/route.ts
// Public: what the customer's upload page needs. No file URLs.
import { NextRequest, NextResponse } from "next/server";
import { requestsCollection, toPublic } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const col = await requestsCollection();
    const doc = await col.findOne({ token });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, request: toPublic(doc) });
  } catch (e) {
    console.error("Public docs GET error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}