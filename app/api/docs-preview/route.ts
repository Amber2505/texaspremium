// app/api/docs-preview/route.ts
// Staff "preview as customer" for /view_documents. Requires today's admin
// security code; the office key stays on the server.
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { securityCode, searchType, searchValue } = (await req
    .json()
    .catch(() => ({}))) as {
    securityCode?: string;
    searchType?: string;
    searchValue?: string;
  };

  if (!securityCode || !searchType || !searchValue) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  // A 4-digit code can be guessed, so cap wrong attempts per computer
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const attempts = (await clientPromise)
    .db("db")
    .collection("docs_preview_attempts");
  const fails = await attempts.countDocuments({
    ip,
    ok: false,
    at: { $gte: new Date(Date.now() - WINDOW_MS) },
  });
  if (fails >= MAX_FAILS) {
    return NextResponse.json(
      { error: "Too many wrong codes. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  // Same daily code the autopay page checks
  let valid = false;
  try {
    const r = await fetch(
      `${process.env.NEXT_PUBLIC_RAILWAY_URL}/verify-security-code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: String(securityCode).trim() }),
      },
    );
    valid = !!(await r.json()).valid;
  } catch {
    valid = false;
  }
  await attempts.insertOne({ ip, ok: valid, at: new Date() });
  if (!valid) {
    return NextResponse.json({ error: "Wrong security code." }, { status: 401 });
  }

  if (!process.env.OFFICE_CAPTURE_KEY) {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const res = await fetch("https://astraldbapi.herokuapp.com/docs/staff-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Office-Key": process.env.OFFICE_CAPTURE_KEY,
    },
    body: JSON.stringify({
      search_type: searchType,
      search_value:
        searchType === "phone"
          ? searchValue.replace(/\D/g, "")
          : searchValue.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.detail || "Lookup failed." },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}