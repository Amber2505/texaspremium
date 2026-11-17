// app/api/payments-to-process/receipt/route.ts
// The Office Helper extension sends PDFs agents open. If one is an agency
// receipt, find the waiting payment(s) in "Paid — Process Now" it belongs to and
// mark them processed with the agent ("Receipt By") and the card authorization
// number(s) ("Ref No"). Anything less than certain is left for a human.
//
// Matching: the customer's phone (from the AgencyMatrix customer page the agent
// had open, sent by the extension), falling back to the customer's name.
// Split payments: "Ref No" may hold several authorizations ("545453/54sdf55/8556f")
// and the receipt total may cover several payment links that add up to it.
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { extractText, getDocumentProxy } from "unpdf";
import { notifyAdmin } from "@/lib/notifyAdmin";
import type { ObjectId } from "mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_SINCE =
  process.env.PROCESSING_TRACK_SINCE || "2026-10-27T00:00:00.000Z";
// Dry run unless explicitly turned on: logs the match, writes nothing.
const LIVE = process.env.RECEIPT_AUTOPROCESS === "on";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_LINKS_PER_RECEIPT = 4; // a receipt can close up to 4 split payments

type Receipt = {
  receiptNo: string;
  receiptBy: string;
  customerId: string;
  customerName: string;
  totalCents: number;
  refs: string[]; // card authorization numbers, one per card used
  policyNos: string[];
  receiptAt: number;
};

type Link = {
  _id: ObjectId;
  amount?: number | null;
  customerPhone?: string;
  description?: string | null;
  timestamps?: { payment?: string | Date };
};

function parseReceipt(raw: string): Receipt | null {
  if (!/Receipt By:/i.test(raw) || !/Amount Tendered/i.test(raw)) return null;
  // The receipt may come after other pages (application packet) and holds a
  // CUSTOMER COPY and an OFFICE COPY — read only the first copy
  const startAt = raw.search(/CUSTOMER COPY/i);
  const fromStart = startAt >= 0 ? raw.slice(startAt) : raw;
  const text = fromStart.split(/OFFICE COPY/i)[0];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Labels are listed first, then the values in the same order:
  // date, customer #, office, receipt #, receipt by, payment made
  const pm = lines.findIndex((l) => /^Payment Made:?$/i.test(l));
  if (pm < 0) return null;
  const [dateLine, customerId, , receiptNo, receiptBy] = lines.slice(pm + 1, pm + 6) as (string | undefined)[];
  const d = (dateLine || "").match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)/i);
  if (!d || !customerId || !receiptNo || !/^\d+$/.test(customerId) || !/^\d+$/.test(receiptNo) || !receiptBy) return null;
  const [, mon, dd, yyyy, hh, mi, ss = "0", ampm] = d;
  const monIdx = MONTHS.indexOf(mon.toLowerCase());
  if (monIdx < 0) return null;
  let h = parseInt(hh, 10) % 12;
  if (ampm.toLowerCase() === "pm") h += 12;
  // Receipt time is Central. +6h is CST; during CDT this is off by an hour,
  // which the 90-minute tolerance below absorbs.
  const receiptAt = Date.UTC(+yyyy, monIdx, +dd, h + 6, +mi, +ss);

  // Name: the line(s) between the agency's "Email:" line and "RECEIPT",
  // minus the customer's email (which the PDF prints without "@" or dots)
  const em = lines.findIndex((l) => /^Email:/i.test(l));
  const rc = lines.findIndex((l, i) => i > em && /^RECEIPT$/i.test(l));
  if (em < 0 || rc < 0) return null;
  const between = lines.slice(em + 1, rc);
  const customerName = (
    between.filter((l) => /\s/.test(l) && !/@/.test(l)).join(" ") || between[0] || ""
  ).trim();

  const total = text.match(/Total\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})/);
  if (!total) return null;

  // Line items: "<policy> <type> CC <ref>[/<ref>...]"
  const items = [
    ...text.matchAll(
      /(\S+)\s+[A-Z]{2,5}\s+(?:CC|DC|CREDIT|DEBIT)\s+([A-Za-z0-9-]{3,20}(?:\s*[\/,]\s*[A-Za-z0-9-]{3,20})*)/g,
    ),
  ];
  const refs = [...new Set(items.flatMap((l) => l[2].split(/\s*[\/,]\s*/)).filter((x) => x.length >= 3))];

  return {
    receiptNo,
    receiptBy: receiptBy.trim().slice(0, 60),
    customerId,
    customerName,
    totalCents: Math.round(parseFloat(total[2].replace(/,/g, "")) * 100),
    refs,
    policyNos: [...new Set(items.map((l) => l[1]))],
    receiptAt,
  };
}

function nameTokens(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function nameMatches(receiptName: string, description: string | null | undefined) {
  if (!description) return false;
  const want = nameTokens(receiptName);
  const have = new Set(nameTokens(description));
  const hits = want.filter((t) => have.has(t)).length;
  return want.length === 1 ? hits === 1 : hits >= 2;
}

const last10 = (p: string | undefined) => (p || "").replace(/\D/g, "").slice(-10);

/** Phone numbers the extension saw on this customer's AgencyMatrix page. */
function phonesFor(customerId: string, amCustomersJson: FormDataEntryValue | null): string[] {
  try {
    const map = JSON.parse(String(amCustomersJson || "{}"));
    const phones: unknown = map?.[customerId]?.phones;
    return Array.isArray(phones) ? phones.map((p) => last10(String(p))).filter((p) => p.length === 10) : [];
  } catch {
    return [];
  }
}

/** Every set of 1–4 links whose amounts add up exactly to the receipt total. */
function setsAddingTo(links: Link[], totalCents: number): Link[][] {
  const found: Link[][] = [];
  const pool = links.slice(0, 12); // keep the search small
  const walk = (start: number, picked: Link[], sum: number) => {
    if (sum === totalCents && picked.length) found.push([...picked]);
    if (sum >= totalCents || picked.length === MAX_LINKS_PER_RECEIPT || found.length > 1) return;
    for (let i = start; i < pool.length; i++) {
      const amt = pool[i].amount || 0;
      if (amt <= 0) continue;
      picked.push(pool[i]);
      walk(i + 1, picked, sum + amt);
      picked.pop();
    }
  };
  walk(0, [], 0);
  return found;
}

export async function POST(req: Request) {
  if (
    !process.env.OFFICE_CAPTURE_KEY ||
    req.headers.get("x-office-key") !== process.env.OFFICE_CAPTURE_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ignored: true });
    }

    let text = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      text = (await extractText(pdf, { mergePages: true })).text as string;
    } catch {
      return NextResponse.json({ ignored: true });
    }

    const r = parseReceipt(text);
    if (!r) {
      if (/Receipt By:/i.test(text)) {
        // Looks like a receipt but the layout didn't parse; log it to fix the parser
        const at = Math.max(0, text.search(/CUSTOMER COPY|RECEIPT INFO/i) - 50);
        console.warn("🧾 Receipt-like PDF did not parse:", text.slice(at, at + 1500));
      }
      return NextResponse.json({ ignored: true });
    }

    const phones = phonesFor(r.customerId, form.get("amCustomers"));
    console.log("🧾 Receipt captured:", { ...r, phones });

    const c = (await clientPromise).db("db").collection<Link>("payment_link_generated");
    const amt = `$${(r.totalCents / 100).toFixed(2)}`;

    // One receipt can only ever close payments once
    if (await c.findOne({ processedReceiptNo: r.receiptNo })) {
      return NextResponse.json({ matched: false, reason: "receipt already used" });
    }

    const waiting = (await c
      .find({
        "completedStages.payment": true,
        processedAt: { $exists: false },
        $or: [
          { "timestamps.payment": { $gte: TRACK_SINCE } },
          { "timestamps.payment": { $gte: new Date(TRACK_SINCE) } },
        ],
      })
      .sort({ "timestamps.payment": 1 })
      .limit(300)
      .toArray()) as Link[];

    // Paid up to 7 days before the receipt (90 min slack for clock/DST)
    const timely = waiting.filter((l) => {
      const paidAt = new Date(l.timestamps?.payment as string).getTime();
      return !isNaN(paidAt) && r.receiptAt >= paidAt - 90 * 60 * 1000 && r.receiptAt - paidAt <= 7 * 24 * 3600 * 1000;
    });

    // Same customer: by any of their AgencyMatrix phones, otherwise by name
    const byPhone = phones.length
      ? timely.filter((l) => phones.includes(last10(l.customerPhone)))
      : [];
    const matchedBy = byPhone.length ? "phone" : "name";
    const sameCustomer = byPhone.length
      ? byPhone
      : timely.filter((l) => nameMatches(r.customerName, l.description));

    const sets = setsAddingTo(sameCustomer, r.totalCents);

    let reason = "";
    if (!r.refs.length) reason = "no card Ref No on the receipt";
    else if (!sameCustomer.length) reason = `no waiting payment for this customer (matched by ${matchedBy})`;
    else if (sets.length === 0) reason = `waiting payment amounts don't add up to ${amt}`;
    else if (sets.length > 1) reason = "more than one combination of payments adds up — pick manually";

    if (reason) {
      console.log(`🧾 Receipt #${r.receiptNo} not auto-processed: ${reason}`);
      if (sameCustomer.length > 0) {
        await notifyAdmin({
          section: "payment-links",
          title: "🧾 Receipt needs manual match",
          body: `${r.customerName} · ${amt} · Receipt #${r.receiptNo}: ${reason}`.slice(0, 120),
          eventId: `receipt-manual-${r.receiptNo}`,
        });
      }
      return NextResponse.json({ matched: false, reason });
    }

    const links = sets[0];
    const confirmation = r.refs.join(" / ").slice(0, 80);
    const ids = links.map((l) => l._id);

    if (!LIVE) {
      console.log(
        `🧪 DRY RUN — would mark ${ids.join(", ")} processed: by ${r.receiptBy}, auth ${confirmation}, receipt #${r.receiptNo} (matched by ${matchedBy})`,
      );
      return NextResponse.json({ matched: true, dryRun: true, linkIds: ids, matchedBy });
    }

    const res = await c.updateMany(
      { _id: { $in: ids }, processedAt: { $exists: false } },
      {
        $set: {
          processedAt: new Date().toISOString(),
          processedBy: r.receiptBy,
          processedConfirmation: confirmation,
          processedConfirmations: r.refs,
          processedVia: "receipt",
          processedMatchedBy: matchedBy,
          processedReceiptNo: r.receiptNo,
          processedPolicyNo: r.policyNos.join(", ") || null,
        },
      },
    );

    if (res.modifiedCount > 0) {
      console.log(`✅ Auto-processed ${res.modifiedCount} payment(s) from receipt #${r.receiptNo}`);
      await notifyAdmin({
        section: "payment-links",
        title: "✅ Payment auto-processed",
        body: `${r.customerName} · ${amt}${links.length > 1 ? ` (${links.length} payments)` : ""} · Auth ${confirmation} · by ${r.receiptBy}`.slice(0, 120),
        eventId: `receipt-auto-${r.receiptNo}`,
      });
    }

    return NextResponse.json({ matched: true, linkIds: ids, matchedBy });
  } catch (err) {
    console.error("receipt capture error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}