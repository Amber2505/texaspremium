// app/api/accounting/square-payments/route.ts
import { NextResponse } from "next/server";

const SQUARE_BASE = "https://connect.squareup.com";

type SquarePayment = {
  id: string;
  status: string;
  amount_money?: { amount: number; currency: string };
  refunded_money?: { amount: number; currency: string };
  created_at: string;
  receipt_number?: string;
  reference_id?: string;
  note?: string;
  card_details?: {
    card?: {
      card_brand?: string;
      last_4?: string;
    };
    auth_result_code?: string;
    application_details?: {
      application_id?: string;
      square_product?: string;
    };
    avs_status?: string;
    cvv_status?: string;
    entry_method?: string;
    statement_description?: string;
    card_payment_timeline?: {
      authorized_at?: string;
      captured_at?: string;
    };
  };
};

type SquarePaymentSummary = {
  id: string;
  amount: number;
  cardBrand: string;
  last4: string;
  createdAt: string;
  receiptNumber: string;
  authCode: string;
  referenceId: string;
  note: string;
};

type DayData = {
  count: number;
  grossAmount: number;
  refundAmount: number;
  payments: SquarePaymentSummary[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const begin = searchParams.get("begin");
  const end = searchParams.get("end");

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

    const payments: SquarePayment[] = [];
    let cursor: string | undefined = undefined;

    do {
      const params = new URLSearchParams({
        begin_time: beginTime,
        end_time: endTime,
        limit: "200",
        sort_order: "ASC",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${SQUARE_BASE}/v2/payments?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Square-Version": "2024-01-18",
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Square payments error:", err);
        return NextResponse.json({ error: "Square API error", details: err }, { status: 502 });
      }

      const data = await res.json();
      const batch = (data.payments || []).filter(
        (p: SquarePayment) =>
          p.status === "COMPLETED" ||
          p.status === "REFUNDED" ||
          p.status === "PARTIALLY_REFUNDED"
      );
      payments.push(...batch);
      cursor = data.cursor;
    } while (cursor);

    const byDate: Record<string, DayData> = {};

    payments.forEach((p) => {
      // Use CST date to match CSV timestamps (which are local time)
      const dateKey = new Date(p.created_at).toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
      });
      if (!byDate[dateKey]) {
        byDate[dateKey] = { count: 0, grossAmount: 0, refundAmount: 0, payments: [] };
      }
      const amount = (p.amount_money?.amount || 0) / 100;
      const refunded = (p.refunded_money?.amount || 0) / 100;
      byDate[dateKey].count++;
      byDate[dateKey].grossAmount += amount;
      byDate[dateKey].refundAmount += refunded;
      // Debug — log full card_details for one payment to find auth code field
      // Only add to matchable payments if not fully refunded
      // Exclude fully refunded payments from matching
      const isFullyRefunded =
        p.status === "REFUNDED" ||
        (p.refunded_money?.amount || 0) >= (p.amount_money?.amount || 1);
      const isZero = (p.amount_money?.amount || 0) === 0;
      if (!isFullyRefunded && !isZero) {
        byDate[dateKey].payments.push({
          id: p.id,
          amount,
          cardBrand: p.card_details?.card?.card_brand || "UNKNOWN",
          last4: p.card_details?.card?.last_4 || "????",
          createdAt: p.created_at,
          receiptNumber: p.receipt_number || "",
          authCode: p.card_details?.auth_result_code || "",
          referenceId: p.reference_id || "",
          note: p.note || "",
        });
      }
    });

    return NextResponse.json({ byDate, totalPayments: payments.length });
  } catch (error) {
    console.error("Square payments fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch Square payments" }, { status: 500 });
  }
}