// lib/verifySquarePayment.ts
// Has this payment link really been paid? Asked before marking a link "paid", so a
// customer who comes back from Square checkout without paying (Back button, closed
// tab, reopened page) can't put a fake payment in "Paid — Process Now".
//
// 1) The Square webhook already saved the payment in completed_payments
//    (same phone + same amount, after the link was created), or
// 2) Square says the link's order has a completed card payment.
import type { Db } from "mongodb";

const SQUARE = "https://connect.squareup.com/v2";
const last10 = (p: unknown) =>
  String(p || "")
    .replace(/\D/g, "")
    .slice(-10);

type LinkDoc = {
  amount?: number | null; // cents
  customerPhone?: string;
  createdAtTimestamp?: number;
  squareLinkId?: string | null;
};

export type Verified =
  | { paid: true; paymentId: string; via: "webhook" | "square" }
  | { paid: false };

async function sq(path: string) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return null;
  const r = await fetch(`${SQUARE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2025-01-23",
    },
    cache: "no-store",
  });
  return r.ok ? r.json() : null;
}

async function fromWebhook(db: Db, link: LinkDoc): Promise<string | null> {
  const phone = last10(link.customerPhone);
  if (!phone || !link.amount) return null;
  const since = new Date(
    (link.createdAtTimestamp || Date.now() - 3 * 86400000) - 5 * 60000,
  );
  const recent = await db
    .collection("completed_payments")
    .find({ amountCents: link.amount, processedAt: { $gte: since } })
    .project({ _id: 1, customerPhone: 1 })
    .toArray();
  const mine = recent
    .filter((p) => last10(p.customerPhone) === phone)
    .map((p) => String(p._id));
  if (!mine.length) return null;
  // A payment already counted for another link can't count again
  const used = await db
    .collection("payment_link_generated")
    .find({ squarePaymentId: { $in: mine } })
    .project({ squarePaymentId: 1 })
    .toArray();
  const taken = new Set(used.map((u) => String(u.squarePaymentId)));
  return mine.find((id) => !taken.has(id)) || null;
}

async function fromSquare(link: LinkDoc): Promise<string | null> {
  if (!link.squareLinkId) return null;
  const pl = await sq(
    `/online-checkout/payment-links/${encodeURIComponent(link.squareLinkId)}`,
  );
  const orderId = pl?.payment_link?.order_id;
  if (!orderId) return null;
  const order = (await sq(`/orders/${encodeURIComponent(orderId)}`))?.order;
  for (const t of order?.tenders || []) {
    if (!t.payment_id) continue;
    const p = (await sq(`/payments/${encodeURIComponent(t.payment_id)}`))
      ?.payment;
    if (p?.status === "COMPLETED" && !(p.refunded_money?.amount > 0))
      return p.id as string;
  }
  return null;
}

/** Checks for up to ~waitMs, since Square's redirect can arrive a few seconds before the webhook. */
export async function verifySquarePayment(
  db: Db,
  link: LinkDoc,
  waitMs = 8000,
): Promise<Verified> {
  const end = Date.now() + waitMs;
  for (;;) {
    const w = await fromWebhook(db, link);
    if (w) return { paid: true, paymentId: w, via: "webhook" };
    const s = await fromSquare(link).catch(() => null);
    if (s) return { paid: true, paymentId: s, via: "square" };
    if (Date.now() >= end) return { paid: false };
    await new Promise((r) => setTimeout(r, 2000));
  }
}