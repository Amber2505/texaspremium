// api/accounting/import-raw/route.ts
/*eslint-disable @typescript-eslint/no-explicit-any*/
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = splitLine(lines[0]).map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (vals[i] || "").replace(/"/g, "").trim()));
    return row;
  });
}

function parseAmount(v: string) {
  return parseFloat((v || "").replace(/[$,\s"]/g, "")) || 0;
}

function parseDateKey(str: string) {
  const m = str.match(/^(\d{2})-(\d{2})-(\d{2,4})/);
  if (!m) return "unknown";
  const year = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${year}-${m[1]}-${m[2]}`;
}

function normalizeMethod(m: string) {
  const l = (m || "").toLowerCase();
  if (l.includes("credit card")) return "Credit Card";
  if (l === "cash") return "Cash";
  if (l.includes("check")) return "Check";
  if (l.includes("forward")) return "Forward";
  if (l.includes("wire")) return "Wire";
  if (l.includes("zelle")) return "Zelle";
  if (l.includes("e-payment")) return "E-Payment";
  return m || "Unknown";
}

export async function POST(req: NextRequest) {
  let client: MongoClient | null = null;
  try {
    const { csv } = await req.json();
    if (!csv) return NextResponse.json({ error: "No CSV" }, { status: 400 });

    const rawRows = parseCSV(csv);
    const map = new Map<string, typeof rawRows>();
    rawRows.forEach((row) => {
      const key = `${row["Receipt"] || ""}_${row["Cust ID"] || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });

    const receipts: any[] = [];
    map.forEach((rows, key) => {
      const [receiptNo] = key.split("_");
      const first = rows[0];
      const dateKey = parseDateKey(first["Date/Time"] || "");
      const isVoided = rows.some((r) =>
        Object.values(r).some((v) => (v || "").toString().trim().toUpperCase() === "VOIDED")
      );
      const parsed = rows
        .map((r) => ({
          policyNo: r["Policy #"] || "",
          policyType: r["Policy Type"] || "",
          company: r["Company"] || "",
          method: normalizeMethod(r["Method"] || ""),
          premium: parseAmount(r["Premium"]),
          fees: parseAmount(r["Fees"]),
          total: parseAmount(r["Total"]),
        }))
        .filter((r) => r.premium > 0 || r.fees > 0);
      if (!parsed.length) return;
      receipts.push({
        receiptNo,
        custId: first["Cust ID"] || "",
        customer: first["Customer"] || "",
        dateTime: first["Date/Time"] || "",
        dateKey,
        referenceNo: rows.map((r) => (r["Reference"] || "").trim()).find((r) => r.length > 0) || "",
        isVoided,
        rows: parsed,
        totalPremium: parsed.reduce((s, r) => s + r.premium, 0),
        totalFees: parsed.reduce((s, r) => s + r.fees, 0),
        totalAmount: parsed.reduce((s, r) => s + r.total, 0),
        methods: [...new Set(parsed.map((r) => r.method))],
      });
    });

    if (!receipts.length) {
      return NextResponse.json({ success: true, inserted: 0, deleted: 0 });
    }

    // Get month key from first receipt
    const monthKey = receipts[0].dateKey.slice(0, 7);

    client = await MongoClient.connect(uri);
    const col = client.db("db").collection("accounting_info");

    const deleted = await col.deleteMany({ dateKey: { $regex: `^${monthKey}` } });
    const result = await col.insertMany(receipts);

    return NextResponse.json({
      success: true,
      inserted: result.insertedCount,
      deleted: deleted.deletedCount,
      monthKey,
    });
  } catch (err: any) {
    console.error("Raw CSV import error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.close();
  }
}