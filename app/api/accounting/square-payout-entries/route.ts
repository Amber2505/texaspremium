// app/api/accounting/square-payout-entries/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextResponse } from "next/server";

const SQUARE_BASE = "https://connect.squareup.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const begin = searchParams.get("begin"); // "2026-05-01"
  const end = searchParams.get("end");     // "2026-05-31"

  if (!begin || !end) {
    return NextResponse.json({ error: "begin and end required" }, { status: 400 });
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "SQUARE_ACCESS_TOKEN not set" }, { status: 500 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Square-Version": "2024-01-18",
    "Content-Type": "application/json",
  };

  try {
    // Step 1: Get all payouts in range
    const payouts: SquarePayout[] = [];
    let cursor: string | undefined;
    // Fetch PAID payouts
    do {
      const params = new URLSearchParams({
        begin_time: `${begin}T00:00:00.000Z`,
        end_time: `${end}T23:59:59.999Z`,
        status: "PAID",
        limit: "100",
        sort_order: "ASC",
      });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`${SQUARE_BASE}/v2/payouts?${params}`, { headers });
      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json({ error: "Square payouts error", details: err }, { status: 502 });
      }
      const data = await res.json();
      payouts.push(...(data.payouts || []));
      cursor = data.cursor;
    } while (cursor);

    // Fetch IN_TRANSIT and PENDING payouts (money scheduled but not yet in bank)
    const pendingPayouts: { id: string; status: string; amount: number; updatedAt: string }[] = [];
    for (const status of ["SENT", "FAILED"]) {
      let pendingCursor: string | undefined;
      do {
        const params = new URLSearchParams({
          status,
          limit: "100",
          sort_order: "DESC",
        });
        if (pendingCursor) params.set("cursor", pendingCursor);
        const res = await fetch(`${SQUARE_BASE}/v2/payouts?${params}`, { headers });
        if (!res.ok) {
          const errBody = await res.json();
          console.error(`❌ Pending payouts fetch failed for status ${status}:`, JSON.stringify(errBody));
          break;
        }
        const data = await res.json();
        console.log(`✅ ${status} payouts:`, JSON.stringify(data.payouts || [], null, 2));
        for (const p of (data.payouts || [])) {
          // Try all possible amount fields
          const amount = toFloat(p.amount_money) 
            || toFloat(p.expected_amount_money)
            || toFloat(p.net_amount_money);
          console.log(`Payout ${p.id}: amount_money=${JSON.stringify(p.amount_money)}, expected=${JSON.stringify(p.expected_amount_money)}, net=${JSON.stringify(p.net_amount_money)}`);
          pendingPayouts.push({
            id: p.id,
            status: p.status,
            amount,
            updatedAt: p.updated_at || "",
          });
        }
        pendingCursor = data.cursor;
      } while (pendingCursor);
    }

    if (!payouts.length) {
      return NextResponse.json({ payouts: [] });
    }

    // Step 2: For each payout, fetch its entries
    const result: PayoutWithEntries[] = [];

    for (const payout of payouts) {
      const entries: PayoutEntry[] = [];
      let entryCursor: string | undefined;

      do {
        const params = new URLSearchParams({ limit: "200" });
        if (entryCursor) params.set("cursor", entryCursor);
        const res = await fetch(
          `${SQUARE_BASE}/v2/payouts/${payout.id}/payout-entries?${params}`,
          { headers }
        );
        if (!res.ok) {
          const errBody = await res.json();
          console.error(`Payout entries failed for ${payout.id}:`, errBody);
          break;
        }
        const data = await res.json();
        console.log(`Payout ${payout.id}: ${(data.payout_entries || []).length} entries, types: ${[...new Set((data.payout_entries || []).map((e: any) => e.type))].join(', ')}`);
        const raw: SquarePayoutEntry[] = data.payout_entries || [];
        entries.push(
          ...raw.map((e) => ({
            id: e.id,
            type: e.type,                     // PAYMENT, REFUND, FEE, etc.
            grossAmount: toFloat(e.gross_amount_money),
            feeAmount: toFloat(e.fee_amount_money),
            netAmount: toFloat(e.net_amount_money),
            paymentId: e.payment_id || null,
            // effectiveAt is when the transaction was included in this payout
            effectiveAt: e.effective_at || "",
            feePercent: e.gross_amount_money?.amount
              ? Math.abs(toFloat(e.fee_amount_money) / toFloat(e.gross_amount_money) * 100)
              : 0,
          }))
        );
        entryCursor = data.cursor;
      } while (entryCursor);

      result.push({
        id: payout.id,
        arrivalDate: payout.arrival_date,
        netAmount: toFloat(payout.amount_money),
        grossAmount: entries
          .filter((e) => e.type === "CHARGE")
          .reduce((s, e) => s + e.grossAmount, 0),
        totalFees: entries
          .filter((e) => e.type === "CHARGE")
          .reduce((s, e) => s + Math.abs(e.feeAmount), 0),
        entries,
      });
    }

    const totalInTransit = pendingPayouts.reduce((s, p) => s + p.amount, 0);
    console.log(`💰 Total in transit: $${totalInTransit.toFixed(2)} across ${pendingPayouts.length} SENT payouts`);
    console.log(`💰 Total PAID deposited: $${result.reduce((s, p) => s + p.netAmount, 0).toFixed(2)} across ${result.length} payouts`);

    // Add SENT payouts to result so they show in breakdown table
    const sentPayoutResults: PayoutWithEntries[] = pendingPayouts.map(p => ({
      id: p.id,
      arrivalDate: p.updatedAt.split('T')[0],
      netAmount: p.amount,
      grossAmount: 0, // no entry-level detail for SENT
      totalFees: 0,
      entries: [],
      status: p.status,
    }));

    return NextResponse.json({
      payouts: result,
      sentPayouts: pendingPayouts,
      totalSent: totalInTransit,
      totalInTransit: 0, // truly unbatched = 0 from API
    });
  } catch (error) {
    console.error("Square payout entries error:", error);
    return NextResponse.json({ error: "Failed to fetch payout entries" }, { status: 500 });
  }
}

function toFloat(money?: { amount?: number }): number {
  return (money?.amount || 0) / 100;
}

type SquarePayout = {
  id: string;
  arrival_date: string;
  amount_money?: { amount: number };
};

type SquarePayoutEntry = {
  id: string;
  type: string;
  gross_amount_money?: { amount: number };
  fee_amount_money?: { amount: number };
  net_amount_money?: { amount: number };
  payment_id?: string;
  effective_at?: string;
};

type PayoutEntry = {
  id: string;
  type: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentId: string | null;
  effectiveAt: string;
  feePercent: number;
};

type PayoutWithEntries = {
  id: string;
  arrivalDate: string;
  netAmount: number;
  grossAmount: number;
  totalFees: number;
  entries: PayoutEntry[];
};