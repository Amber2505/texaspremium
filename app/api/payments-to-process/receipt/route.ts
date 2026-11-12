// The Office Helper extension sends PDFs agents open. If one is an agency
// receipt that matches exactly ONE payment waiting in "Paid — Process Now",
// mark that payment processed. Anything less certain is left for a human.
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { extractText, getDocumentProxy } from "unpdf";
import { notifyAdmin } from "@/lib/notifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_SINCE =
  process.env.PROCESSING_TRACK_SINCE || "2026-10-27T00:00:00.000Z";
// Dry run unless explicitly turned on: logs the match, writes nothing.
const LIVE = process.env.RECEIPT_AUTOPROCESS === "on";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type Receipt = {
  receiptNo: string;
  receiptBy: string;
  customerName: string;
  totalCents: number;
  refNo: string | null; // null when the receipt has more than one line item
  policyNo: string | null;
  receiptAt: number;
};

function parseReceipt(text: string): Receipt | null {
  if (!/Receipt By:/i.test(text) || !/Amount Tendered/i.test(text)) return null;

  // Values come after the label block, in order:
  // date, customer #, office, receipt #, receipt by, payment made
  const block = text.match(
    /Payment Made:\s*([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)\s+\d+\s+\d+\s+(\d+)\s+(.+?)\s+(?:Over The Phone|In Office|In Person|Walk[- ]?In|Online|Mail)\b/i,
  );
  const customer = text.match(/support@\S+\s+([A-Za-z][A-Za-z' .-]+?)\s+\d/i);
  const total = text.match(/Total\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
  if (!block || !customer || !total) return null;

  const [, mon, dd, yyyy, hh, mi, ss, ampm, receiptNo, receiptBy] = block;
  const monIdx = MONTHS.indexOf(mon.toLowerCase());
  if (monIdx < 0) return null;
  let h = parseInt(hh, 10) % 12;
  if (ampm.toLowerCase() === "pm") h += 12;
  // Receipt time is Central. +6h is CST; during CDT this is off by an hour,
  // which the 90-minute tolerance below absorbs.
  const receiptAt = Date.UTC(+yyyy, monIdx, +dd, h + 6, +mi, +ss);

  const lines = [
    ...text.matchAll(/\b([A-Z0-9]{8,20})\s+[A-Z]{2,5}\s+(?:CC|DC|CREDIT|DEBIT)\s+([A-Za-z0-9-]{4,20})\b/g),
  ];

  return {
    receiptNo,
    receiptBy: receiptBy.trim().slice(0, 60),
    customerName: customer[1].trim(),
    totalCents: Math.round(parseFloat(total[2].replace(/,/g, "")) * 100),
    refNo: lines.length === 1 ? lines[0][2] : null,
    policyNo: lines.length === 1 ? lines[0][1] : null,
    receiptAt,
  };
}

function nameTokens(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function nameMatches(receiptName: string, description: string | null) {
  if (!description) return false;
  const want = nameTokens(receiptName);
  const have = new Set(nameTokens(description));
  const hits = want.filter((t) => have.has(t)).length;
  return want.length === 1 ? hits === 1 : hits >= 2;
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
        console.warn("🧾 Receipt-like PDF did not parse:", text.slice(0, 1500));
      }
      return NextResponse.json({ ignored: true });
    }

    console.log("🧾 Receipt captured:", r);

    const c = (await clientPromise).db("db").collection("payment_link_generated");

    const candidates = await c
      .find({
        "completedStages.payment": true,
        processedAt: { $exists: false },
        amount: r.totalCents,
        $or: [
          { "timestamps.payment": { $gte: TRACK_SINCE } },
          { "timestamps.payment": { $gte: new Date(TRACK_SINCE) } },
        ],
      })
      .toArray();

    const matches = candidates.filter((l) => {
      const paidAt = new Date(l.timestamps?.payment).getTime();
      if (isNaN(paidAt)) return false;
      const timingOk =
        r.receiptAt >= paidAt - 90 * 60 * 1000 &&
        r.receiptAt - paidAt <= 7 * 24 * 60 * 60 * 1000;
      return timingOk && nameMatches(r.customerName, l.description);
    });

    const amt = `$${(r.totalCents / 100).toFixed(2)}`;

    if (!r.refNo || matches.length !== 1) {
      const reason = !r.refNo
        ? "receipt has multiple line items"
        : matches.length === 0
          ? "no waiting payment matched amount + name"
          : `${matches.length} waiting payments matched`;
      console.log(`🧾 Receipt #${r.receiptNo} not auto-processed: ${reason}`);
      // Only nag when a waiting payment plausibly belongs to this receipt
      if (candidates.length > 0) {
        await notifyAdmin({
          section: "payment-links",
          title: "🧾 Receipt needs manual match",
          body: `${r.customerName} · ${amt} · Receipt #${r.receiptNo}: ${reason}`.slice(0, 120),
          eventId: `receipt-manual-${r.receiptNo}`,
        });
      }
      return NextResponse.json({ matched: false, reason });
    }

    const link = matches[0];

    // One receipt can only ever close one payment
    const reused = await c.findOne({ processedReceiptNo: r.receiptNo });
    if (reused) {
      return NextResponse.json({ matched: false, reason: "receipt already used" });
    }

    if (!LIVE) {
      console.log(
        `🧪 DRY RUN — would mark ${link._id} processed: by ${r.receiptBy}, auth #${r.refNo}, receipt #${r.receiptNo}`,
      );
      return NextResponse.json({ matched: true, dryRun: true, linkId: link._id });
    }

    const res = await c.updateOne(
      { _id: link._id, processedAt: { $exists: false } },
      {
        $set: {
          processedAt: new Date().toISOString(),
          processedBy: r.receiptBy,
          processedConfirmation: r.refNo,
          processedVia: "receipt",
          processedReceiptNo: r.receiptNo,
          processedPolicyNo: r.policyNo,
        },
      },
    );

    if (res.modifiedCount === 1) {
      console.log(`✅ Auto-processed ${link._id} from receipt #${r.receiptNo}`);
      await notifyAdmin({
        section: "payment-links",
        title: "✅ Payment auto-processed",
        body: `${r.customerName} · ${amt} · Auth #${r.refNo} · by ${r.receiptBy}`.slice(0, 120),
        eventId: `receipt-auto-${r.receiptNo}`,
      });
    }

    return NextResponse.json({ matched: true, linkId: link._id });
  } catch (err) {
    console.error("receipt capture error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}