// lib/accountingReceipts.ts
// Turns Transaction Detail rows (from the CSV, or from the AgencyMatrix report the
// cloud browser pulls each morning) into receipts. Same rules as the Accounting
// page's Import CSV.
export type RawRow = Record<string, string>;

export type ReceiptRow = {
  policyNo: string;
  policyType: string;
  company: string;
  method: string;
  premium: number;
  fees: number;
  total: number;
};

export type Receipt = {
  receiptNo: string;
  custId: string;
  customer: string;
  dateTime: string;
  dateKey: string;
  referenceNo: string;
  isVoided: boolean;
  rows: ReceiptRow[];
  totalPremium: number;
  totalFees: number;
  totalAmount: number;
  methods: string[];
};

const FEE_TYPES = [
  "agency fee",
  "installment fee",
  "ren fees",
  "rwr fees",
  "endorsement fee",
  "othr",
  "fees",
];

export const REQUIRED_HEADERS = [
  "Receipt",
  "Customer",
  "Date/Time",
  "Policy Type",
  "Method",
  "Premium",
  "Fees",
  "Total",
];

function isFeeRow(row: RawRow) {
  return FEE_TYPES.some((f) =>
    (row["Policy Type"] || "").toLowerCase().includes(f),
  );
}

export function parseAmount(v: string) {
  const s = (v || "").trim();
  const n = parseFloat(s.replace(/[$,\s"()]/g, "")) || 0;
  return /^\(.*\)$/.test(s) ? -n : n; // (12.00) = -12.00
}

// "11-23-26 10:15 AM", "11/23/2026 10:15 AM" -> "2026-11-23"
export function parseDateKey(str: string) {
  const m = (str || "").trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!m) return "unknown";
  const year = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function normalizeMethod(m: string) {
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

export function rowsToReceipts(rawRows: RawRow[]): Receipt[] {
  const map = new Map<string, RawRow[]>();
  rawRows.forEach((row) => {
    if (!(row["Receipt"] || "").trim()) return; // totals / blank lines
    const key = `${row["Receipt"] || ""}_${row["Cust ID"] || ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  const receipts: Receipt[] = [];
  map.forEach((rows, key) => {
    const [receiptNo] = key.split("_");
    const first = rows[0];
    const isVoided = rows.some((r) =>
      Object.values(r).some(
        (v) => (v || "").toString().trim().toUpperCase() === "VOIDED",
      ),
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
        isFeeRow: isFeeRow(r),
      }))
      .filter((r) => r.premium > 0 || r.fees > 0);
    if (!parsed.length) return;
    const totalPremium = parsed.reduce((s, r) => s + r.premium, 0);
    const totalFees = parsed.reduce((s, r) => s + r.fees, 0);
    receipts.push({
      receiptNo,
      custId: first["Cust ID"] || "",
      customer: first["Customer"] || "",
      dateTime: first["Date/Time"] || "",
      dateKey: parseDateKey(first["Date/Time"] || ""),
      referenceNo:
        rows
          .map((r) => (r["Reference"] || "").trim())
          .find((r) => r.length > 0) || "",
      isVoided,
      rows: parsed,
      totalPremium,
      totalFees,
      totalAmount: totalPremium + totalFees,
      methods: [...new Set(parsed.map((r) => r.method))],
    });
  });
  return receipts;
}