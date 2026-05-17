// app/api/accounting/square-payouts/route.ts
// Fetches Square payouts (actual bank deposits) for a date range
// Each payout = what Square actually sent to your bank account (net of fees)

import { NextResponse } from "next/server";

const SQUARE_BASE = "https://connect.squareup.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const begin = searchParams.get("begin"); // e.g. "2026-05-01"
  const end = searchParams.get("end");     // e.g. "2026-05-31"

  if (!begin || !end) {
    return NextResponse.json({ error: "begin and end dates required" }, { status: 400 });
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "SQUARE_ACCESS_TOKEN not set" }, { status: 500 });
  }

  try {
    const beginTime = `${begin}T00:00:00.000Z`;
    const endTime = `${end}T23:59:59.999Z`;

    const payouts: SquarePayout[] = [];
    let cursor: string | undefined = undefined;

    do {
      const params = new URLSearchParams({
        begin_time: beginTime,
        end_time: endTime,
        status: "PAID",
        limit: "100",
        sort_order: "ASC",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${SQUARE_BASE}/v2/payouts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Square-Version": "2024-01-18",
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Square payouts error:", err);
        return NextResponse.json({ error: "Square API error", details: err }, { status: 502 });
      }

      const data = await res.json();
      payouts.push(...(data.payouts || []));
      cursor = data.cursor;
    } while (cursor);

    // Each payout has an arrival_date (when it hits your bank)
    // and a period (what dates of transactions it covers)
    const result = payouts.map((p) => ({
      id: p.id,
      status: p.status,
      arrivalDate: p.arrival_date,        // date it hit your bank
      netAmount: (p.amount_money?.amount || 0) / 100,  // what you actually received
      // Square doesn't give gross/fee split directly in payout —
      // you get that from the payout entries (separate call)
    }));

    return NextResponse.json({ payouts: result });
  } catch (error) {
    console.error("Square payouts fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch Square payouts" }, { status: 500 });
  }
}

type SquarePayout = {
  id: string;
  status: string;
  arrival_date: string;
  amount_money?: { amount: number; currency: string };
};