// app/[locale]/admin/accounting/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import AdminShell from "../_components/AdminShell";
import AgencyFeeChart from "./_components/AgencyFeeChart";
import {
  Upload,
  ChevronDown,
  ChevronRight,
  Edit,
  Check,
  X,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, string>;

type ReceiptRow = {
  policyNo: string;
  policyType: string;
  company: string;
  method: string;
  premium: number;
  fees: number;
  total: number;
};

type Receipt = {
  _id?: string;
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
  notes?: string;
};

type DaySummary = {
  dateKey: string;
  dateLabel: string;
  receipts: Receipt[];
  grandTotal: number;
  totalPremium: number;
  totalFees: number;
  byMethod: Record<string, number>;
};

type SquareDayData = {
  count: number;
  grossAmount: number;
  refundAmount: number;
  payments: {
    id: string;
    amount: number;
    createdAt: string;
    authCode: string;
    referenceId: string;
    receiptNumber: string;
  }[];
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

type MatchedReceipt = {
  receiptNo: string;
  customer: string;
  dateKey: string;
  referenceNo: string;
  amount: number;
  squarePaymentId: string | null;
  matched: boolean;
  matchedBy: "reference" | "amount" | null;
  note?: string;
};

type UnmatchedSquarePayment = { id: string; amount: number; createdAt: string };

type GlobalReconciliation = {
  totalCSVCC: number;
  totalSquareGross: number;
  totalRefunds: number;
  matched: MatchedReceipt[];
  unmatchedCSV: MatchedReceipt[];
  unmatchedSquare: UnmatchedSquarePayment[];
  isBalanced: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FEE_TYPES = [
  "agency fee",
  "installment fee",
  "ren fees",
  "rwr fees",
  "endorsement fee",
  "othr",
  "fees",
];
function isFeeRow(row: RawRow) {
  return FEE_TYPES.some((f) =>
    (row["Policy Type"] || "").toLowerCase().includes(f),
  );
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
function formatDateLabel(key: string) {
  if (key === "unknown") return "Unknown Date";
  return new Date(key + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function toCST(utcStr: string) {
  return new Date(utcStr).toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
function normalizeAuth(c: string) {
  return c.replace(/^0+/, "").toLowerCase();
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

const METHOD_COLOR: Record<string, string> = {
  "Credit Card": "bg-blue-100 text-blue-800",
  Cash: "bg-green-100 text-green-800",
  Check: "bg-yellow-100 text-yellow-800",
  Forward: "bg-orange-100 text-orange-800",
  Wire: "bg-purple-100 text-purple-800",
  Zelle: "bg-indigo-100 text-indigo-800",
  "E-Payment": "bg-teal-100 text-teal-800",
};
const METHODS = [
  "Credit Card",
  "Cash",
  "Check",
  "Forward",
  "Wire",
  "Zelle",
  "E-Payment",
];

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "",
    inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): RawRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = splitLine(lines[0]).map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: RawRow = {};
    headers.forEach(
      (h, i) => (row[h] = (vals[i] || "").replace(/"/g, "").trim()),
    );
    if (vals.length > headers.length) {
      row["_extra"] = vals
        .slice(headers.length)
        .map((v) => v.replace(/"/g, "").trim())
        .join(",");
    }
    return row;
  });
}

function processCSVToReceipts(rawRows: RawRow[]): Receipt[] {
  const map = new Map<string, RawRow[]>();
  rawRows.forEach((row) => {
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
    const parsed: ReceiptRow[] = rows
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

function groupIntoDays(receipts: Receipt[]): DaySummary[] {
  const dayMap = new Map<string, Receipt[]>();
  receipts.forEach((r) => {
    if (!dayMap.has(r.dateKey)) dayMap.set(r.dateKey, []);
    dayMap.get(r.dateKey)!.push(r);
  });
  return [...dayMap.keys()]
    .sort((a, b) => (a === "unknown" ? 1 : a.localeCompare(b)))
    .map((dateKey) => {
      const recs = dayMap
        .get(dateKey)!
        .sort((a, b) => parseInt(a.receiptNo) - parseInt(b.receiptNo));
      const byMethod: Record<string, number> = {};
      recs.forEach((r) =>
        r.rows.forEach((row) => {
          byMethod[row.method] = (byMethod[row.method] || 0) + row.total;
        }),
      );
      return {
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        receipts: recs,
        grandTotal: recs.reduce((s, r) => s + r.totalAmount, 0),
        totalPremium: recs.reduce((s, r) => s + r.totalPremium, 0),
        totalFees: recs.reduce((s, r) => s + r.totalFees, 0),
        byMethod,
      };
    });
}

function buildGlobalReconciliation(
  days: DaySummary[],
  squareByDate: Record<string, SquareDayData>,
): GlobalReconciliation {
  const allCSVReceipts = days.flatMap((d) =>
    d.receipts
      .filter(
        (r) =>
          r.methods.includes("Credit Card") && r.totalAmount > 0 && !r.isVoided,
      )
      .map((r) => ({
        receiptNo: r.receiptNo,
        customer: r.customer,
        dateKey: r.dateKey,
        referenceNo: r.referenceNo || "",
        amount: r.rows
          .filter((row) => row.method === "Credit Card")
          .reduce((s, row) => s + row.total, 0),
      }))
      .filter((r) => r.amount > 0),
  );

  const allSquarePayments = Object.values(squareByDate).flatMap(
    (d) => d.payments || [],
  );
  const totalCSVCC = allCSVReceipts.reduce((s, r) => s + r.amount, 0);
  const totalSquareGross = allSquarePayments.reduce((s, p) => s + p.amount, 0);
  const usedSquare = new Set<string>();
  const matched: MatchedReceipt[] = [];
  const unmatchedCSV: MatchedReceipt[] = [];

  const sorted = [...allCSVReceipts].sort(
    (a, b) =>
      (a.referenceNo.trim().length > 0 ? 0 : 1) -
      (b.referenceNo.trim().length > 0 ? 0 : 1),
  );
  const afterPass1A: typeof allCSVReceipts = [];

  sorted.forEach((csv) => {
    const refCodes = csv.referenceNo
      ? csv.referenceNo
          .split("/")
          .map((r) => r.trim())
          .filter(Boolean)
      : [];
    if (!refCodes.length) {
      afterPass1A.push(csv);
      return;
    }
    const tempUsed = new Set<string>();
    const foundMatches: typeof allSquarePayments = [];
    refCodes.forEach((code) => {
      const m = allSquarePayments.find(
        (sp) =>
          !usedSquare.has(sp.id) &&
          !tempUsed.has(sp.id) &&
          normalizeAuth(sp.authCode) === normalizeAuth(code),
      );
      if (m) {
        foundMatches.push(m);
        tempUsed.add(m.id);
      } else {
        const m2 = allSquarePayments.find(
          (sp) =>
            !usedSquare.has(sp.id) &&
            !tempUsed.has(sp.id) &&
            (normalizeAuth(sp.referenceId) === normalizeAuth(code) ||
              normalizeAuth(sp.receiptNumber) === normalizeAuth(code)),
        );
        if (m2) {
          foundMatches.push(m2);
          tempUsed.add(m2.id);
        }
      }
    });
    if (foundMatches.length === refCodes.length && foundMatches.length > 0) {
      foundMatches.forEach((m) => usedSquare.add(m.id));
      matched.push({
        ...csv,
        squarePaymentId: foundMatches.map((m) => m.id).join(", "),
        matched: true,
        matchedBy: "reference",
      });
    } else if (foundMatches.length > 0) {
      foundMatches.forEach((m) => usedSquare.add(m.id));
      const remaining =
        csv.amount - foundMatches.reduce((s, m) => s + m.amount, 0);
      matched.push({
        ...csv,
        squarePaymentId: foundMatches.map((m) => m.id).join(", "),
        matched: true,
        matchedBy: "reference",
        note: `Partial: ${foundMatches.length}/${refCodes.length} cards, ${remaining > 0 ? `$${remaining.toFixed(2)} unaccounted` : "balanced"}`,
      });
    } else afterPass1A.push(csv);
  });

  afterPass1A.forEach((csv) => {
    const m = csv.referenceNo
      ? allSquarePayments.find(
          (sp) =>
            !usedSquare.has(sp.id) && Math.abs(sp.amount - csv.amount) < 0.02,
        )
      : undefined;
    if (m) {
      usedSquare.add(m.id);
      matched.push({
        ...csv,
        squarePaymentId: m.id,
        matched: true,
        matchedBy: "amount",
      });
    } else
      unmatchedCSV.push({
        ...csv,
        squarePaymentId: null,
        matched: false,
        matchedBy: null,
      });
  });

  // Second pass — cross-day auth first, then amount
  const afterAuth2: MatchedReceipt[] = [];
  unmatchedCSV.forEach((csv) => {
    const codes = csv.referenceNo
      ? csv.referenceNo
          .split("/")
          .map((r) => r.trim())
          .filter(Boolean)
      : [];
    const m =
      codes.length > 0
        ? allSquarePayments.find(
            (sp) =>
              !usedSquare.has(sp.id) &&
              codes.some(
                (c) => normalizeAuth(sp.authCode) === normalizeAuth(c),
              ),
          )
        : undefined;
    if (m) {
      usedSquare.add(m.id);
      matched.push({
        ...csv,
        squarePaymentId: m.id,
        matched: true,
        matchedBy: "reference",
        note: "Timezone shift",
      });
    } else afterAuth2.push(csv);
  });
  const stillUnmatched: MatchedReceipt[] = [];
  afterAuth2.forEach((csv) => {
    const m = allSquarePayments.find(
      (sp) => !usedSquare.has(sp.id) && Math.abs(sp.amount - csv.amount) < 0.02,
    );
    if (m) {
      usedSquare.add(m.id);
      matched.push({
        ...csv,
        squarePaymentId: m.id,
        matched: true,
        matchedBy: "amount",
        note: "Timezone shift",
      });
    } else stillUnmatched.push(csv);
  });
  unmatchedCSV.length = 0;
  stillUnmatched.forEach((r) => unmatchedCSV.push(r));

  const unmatchedSquare = allSquarePayments
    .filter((sp) => !usedSquare.has(sp.id))
    .map((sp) => ({ id: sp.id, amount: sp.amount, createdAt: sp.createdAt }));
  const totalRefunds = Object.values(squareByDate).reduce(
    (s, d) => s + (d.refundAmount || 0),
    0,
  );

  return {
    totalCSVCC,
    totalSquareGross,
    totalRefunds,
    matched,
    unmatchedCSV,
    unmatchedSquare,
    isBalanced: Math.abs(totalCSVCC - (totalSquareGross - totalRefunds)) < 0.5,
  };
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ method }: { method: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${METHOD_COLOR[method] || "bg-gray-100 text-gray-600"}`}
    >
      {method}
    </span>
  );
}

// ─── Receipt Card ─────────────────────────────────────────────────────────────

function ReceiptCard({
  receipt,
  onSave,
}: {
  receipt: Receipt;
  onSave: (id: string, rows: ReceiptRow[], notes: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<ReceiptRow[]>([]);
  const [editNotes, setEditNotes] = useState(receipt.notes || "");
  const [saving, setSaving] = useState(false);
  const time = receipt.dateTime.split(" ").slice(1, 3).join(" ");

  const startEdit = () => {
    setEditRows(receipt.rows.map((r) => ({ ...r })));
    setEditNotes(receipt.notes || "");
    setEditing(true);
    setOpen(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    if (!receipt._id) return;
    setSaving(true);
    await onSave(receipt._id, editRows, editNotes);
    setSaving(false);
    setEditing(false);
  };
  const updateRow = (
    i: number,
    field: keyof ReceiptRow,
    value: string | number,
  ) => {
    setEditRows((prev) => {
      const next = [...prev];
      const row = { ...next[i] };
      if (field === "premium" || field === "fees") {
        const num = parseFloat(String(value)) || 0;
        (row[field] as number) = num;
        row.total = row.premium + row.fees;
      } else (row[field] as string) = String(value);
      next[i] = row;
      return next;
    });
  };
  const displayRows = editing ? editRows : receipt.rows;
  const displayTotal = editing
    ? editRows.reduce((s, r) => s + r.total, 0)
    : receipt.totalAmount;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
        <button
          onClick={() => !editing && setOpen(!open)}
          className="flex-shrink-0 text-gray-400"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        <span className="text-xs text-gray-400 font-mono w-12 flex-shrink-0">
          #{receipt.receiptNo}
        </span>
        <span className="font-medium text-gray-900 flex-1 min-w-0 truncate">
          {receipt.customer || "—"}
        </span>
        {receipt.isVoided && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded flex-shrink-0 line-through">
            Voided
          </span>
        )}
        {receipt.methods.length > 1 && !receipt.isVoided && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded flex-shrink-0">
            Split
          </span>
        )}
        <div className="flex gap-1 flex-shrink-0">
          {receipt.methods.map((m) => (
            <Badge key={m} method={m} />
          ))}
        </div>
        <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
          {time}
        </span>
        <span className="font-semibold text-gray-900 w-24 text-right flex-shrink-0">
          {fmt(displayTotal)}
        </span>
        {receipt._id && !editing && (
          <button
            onClick={startEdit}
            className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
          >
            <Edit className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
        {editing && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={saveEdit}
              disabled={saving}
              className="p-1 hover:bg-green-100 rounded"
            >
              <Check className="w-3.5 h-3.5 text-green-600" />
            </button>
            <button
              onClick={cancelEdit}
              className="p-1 hover:bg-red-100 rounded"
            >
              <X className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-4 py-1.5 text-left">Policy #</th>
                <th className="px-4 py-1.5 text-left">Description</th>
                <th className="px-4 py-1.5 text-left">Company</th>
                <th className="px-4 py-1.5 text-center">Method</th>
                <th className="px-4 py-1.5 text-right">Premium</th>
                <th className="px-4 py-1.5 text-right">Fees</th>
                <th className="px-4 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-1.5 font-mono text-gray-600">
                    {row.policyNo || "—"}
                  </td>
                  <td className="px-4 py-1.5 text-gray-600">
                    {row.policyType}
                  </td>
                  <td className="px-4 py-1.5 text-gray-500 max-w-[140px] truncate">
                    {row.company || "—"}
                  </td>
                  <td className="px-4 py-1.5 text-center">
                    {editing ? (
                      <select
                        value={row.method}
                        onChange={(e) => updateRow(i, "method", e.target.value)}
                        className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
                      >
                        {METHODS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge method={row.method} />
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.premium}
                        onChange={(e) =>
                          updateRow(i, "premium", e.target.value)
                        }
                        className="w-20 text-xs border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    ) : row.premium > 0 ? (
                      fmt(row.premium)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right text-orange-600">
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.fees}
                        onChange={(e) => updateRow(i, "fees", e.target.value)}
                        className="w-20 text-xs border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    ) : row.fees > 0 ? (
                      fmt(row.fees)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right font-medium">
                    {fmt(row.total)}
                  </td>
                </tr>
              ))}
              {displayRows.length > 1 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                  <td colSpan={4} className="px-4 py-1.5 text-gray-500">
                    Receipt total
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    {fmt(displayRows.reduce((s, r) => s + r.premium, 0))}
                  </td>
                  <td className="px-4 py-1.5 text-right text-orange-600">
                    {fmt(displayRows.reduce((s, r) => s + r.fees, 0))}
                  </td>
                  <td className="px-4 py-1.5 text-right font-bold">
                    {fmt(displayRows.reduce((s, r) => s + r.total, 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            {editing ? (
              <input
                type="text"
                placeholder="Add a note…"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              />
            ) : receipt.notes ? (
              <p className="text-xs text-gray-500 italic">📝 {receipt.notes}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Square Panel ─────────────────────────────────────────────────────────────

function SquarePanel({
  dateKey,
  csvCCTotal,
  squareDay,
  payouts,
  csvReceipts,
  allCsvReceipts,
  squareByDate,
}: {
  dateKey: string;
  csvCCTotal: number;
  squareDay?: SquareDayData;
  payouts: PayoutWithEntries[];
  csvReceipts: Receipt[];
  allCsvReceipts: Receipt[];
  squareByDate: Record<string, SquareDayData>;
}) {
  const [showEntries, setShowEntries] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const csvReceiptTotals = csvReceipts
    .map((r) => {
      const ccRows = r.rows.filter((row) => row.method === "Credit Card");
      return {
        amount: ccRows.reduce((s, row) => s + row.total, 0),
        customer: r.customer,
        receiptNo: r.receiptNo,
        referenceNo: r.referenceNo || "",
        ccRows,
      };
    })
    .filter((r) => r.amount > 0);

  const squarePayments = squareDay?.payments || [];
  const usedSquare = new Set<string>();
  const usedCSV = new Set<number>();

  csvReceiptTotals.forEach((csv, i) => {
    const m = squarePayments.find(
      (sp) => !usedSquare.has(sp.id) && Math.abs(sp.amount - csv.amount) < 0.02,
    );
    if (m) {
      usedSquare.add(m.id);
      usedCSV.add(i);
    }
  });
  csvReceiptTotals.forEach((csv, i) => {
    if (usedCSV.has(i)) return;
    let found = true;
    csv.ccRows.forEach((row) => {
      const m = squarePayments.find(
        (sp) =>
          !usedSquare.has(sp.id) && Math.abs(sp.amount - row.total) < 0.02,
      );
      if (m) usedSquare.add(m.id);
      else found = false;
    });
    if (found && csv.ccRows.length > 0) usedCSV.add(i);
  });

  const timezoneShifted: {
    sp: (typeof squarePayments)[0];
    fromDate: string;
    customer: string;
  }[] = [];
  const stillUnmatchedSquare: typeof squarePayments = [];
  squarePayments
    .filter((sp) => !usedSquare.has(sp.id))
    .forEach((sp) => {
      const otherTotals = allCsvReceipts
        .filter(
          (r) => r.dateKey !== dateKey && r.methods.includes("Credit Card"),
        )
        .map((r) => ({
          amount: r.rows
            .filter((row) => row.method === "Credit Card")
            .reduce((s, row) => s + row.total, 0),
          customer: r.customer,
          dateKey: r.dateKey,
          authCodes: (r.referenceNo || "")
            .split("/")
            .map((c) => c.trim())
            .filter(Boolean),
        }));
      const authMatch = sp.authCode
        ? otherTotals.find((c) =>
            c.authCodes.some(
              (code) => normalizeAuth(sp.authCode) === normalizeAuth(code),
            ),
          )
        : undefined;
      const amountMatch = !authMatch
        ? otherTotals.find((c) => Math.abs(c.amount - sp.amount) < 0.02)
        : undefined;
      const crossMatch = authMatch || amountMatch;
      if (crossMatch)
        timezoneShifted.push({
          sp,
          fromDate: crossMatch.dateKey,
          customer: crossMatch.customer,
        });
      else stillUnmatchedSquare.push(sp);
    });

  const allSquarePaymentsGlobal = Object.values(squareByDate).flatMap(
    (d) => d.payments || [],
  );
  const unmatchedCSV = csvReceiptTotals.filter((csv, i) => {
    if (usedCSV.has(i)) return false;
    const authCodes = (csv.referenceNo || "")
      .split("/")
      .map((c) => c.trim())
      .filter(Boolean);
    if (authCodes.length > 0) {
      const crossDayMatch = allSquarePaymentsGlobal.find((sp) =>
        authCodes.some(
          (code) => normalizeAuth(sp.authCode) === normalizeAuth(code),
        ),
      );
      if (crossDayMatch) return false;
    }
    return true;
  });

  const squareGross = squareDay?.grossAmount || 0;
  const grossDiff = squareGross - csvCCTotal;
  const timezoneShiftedTotal = timezoneShifted.reduce(
    (s, t) => s + t.sp.amount,
    0,
  );
  const trueGrossDiff =
    grossDiff - (grossDiff > 0 ? timezoneShiftedTotal : -timezoneShiftedTotal);
  const trueMatch = Math.abs(trueGrossDiff) < 0.5;

  const dateEntries = payouts.flatMap((p) =>
    p.entries.filter(
      (e) => toCST(e.effectiveAt) === dateKey && e.type === "PAYMENT",
    ),
  );
  const totalGross = dateEntries.reduce((s, e) => s + e.grossAmount, 0);
  const totalFees = dateEntries.reduce((s, e) => s + Math.abs(e.feeAmount), 0);
  const totalNet = dateEntries.reduce((s, e) => s + e.netAmount, 0);
  const blendedRate = totalGross > 0 ? (totalFees / totalGross) * 100 : 0;
  const depositPayouts = payouts.filter((p) =>
    p.entries.some((e) => e.effectiveAt.startsWith(dateKey)),
  );

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-purple-700">
          Square Reconciliation
        </p>
        {dateEntries.length > 0 && (
          <button
            onClick={() => setShowEntries(!showEntries)}
            className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
          >
            {showEntries ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {dateEntries.length} transaction
            {dateEntries.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-6 text-sm mb-2">
        <div>
          <p className="text-xs text-purple-600">CSV credit card</p>
          <p className="font-semibold text-gray-900">{fmt(csvCCTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-purple-600">Square gross</p>
          <p className="font-semibold text-gray-900">
            {squareGross > 0 ? fmt(squareGross) : "—"}
          </p>
        </div>
        {squareGross > 0 && (
          <div className="flex items-center gap-1.5 self-center">
            {trueMatch ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-700">
                  Match
                </span>
                {timezoneShifted.length > 0 && (
                  <span className="text-[10px] text-amber-600">
                    ({timezoneShifted.length} timezone-shifted)
                  </span>
                )}
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div>
                  <span className="text-xs font-medium text-red-600 block">
                    Off by {fmt(Math.abs(trueGrossDiff))}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {trueGrossDiff > 0
                      ? "Square higher"
                      : "CSV higher — check for cash errors"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
        {totalGross > 0 && (
          <>
            <div className="h-8 w-px bg-purple-200 self-center" />
            <div>
              <p className="text-xs text-purple-600">Square fees</p>
              <p className="font-semibold text-red-600">
                {fmt(totalFees)}{" "}
                <span className="text-xs text-gray-500">
                  ({blendedRate.toFixed(2)}%)
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-purple-600">Net to bank</p>
              <p className="font-semibold text-green-700">{fmt(totalNet)}</p>
            </div>
            {depositPayouts.map((p) => (
              <div key={p.id}>
                <p className="text-xs text-purple-600">Bank deposit</p>
                <p className="font-semibold text-gray-900 text-xs">
                  {p.arrivalDate} · {fmt(p.netAmount)}
                </p>
              </div>
            ))}
          </>
        )}
        {squareGross === 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 self-center">
            <Clock className="w-4 h-4" />
            Click Square Reconcile to load
          </div>
        )}
        {(stillUnmatchedSquare.length > 0 ||
          timezoneShifted.length > 0 ||
          unmatchedCSV.length > 0) && (
          <button
            onClick={() => setShowUnmatched(!showUnmatched)}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 self-center ml-auto"
          >
            {showUnmatched ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {stillUnmatchedSquare.length > 0
              ? `${stillUnmatchedSquare.length} unmatched`
              : timezoneShifted.length > 0
                ? `${timezoneShifted.length} timezone shifted`
                : `${unmatchedCSV.length} CSV unmatched`}
          </button>
        )}
      </div>

      {showUnmatched && (
        <div className="mb-2 border border-red-200 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
            Square payments with no matching CSV receipt
          </div>
          {timezoneShifted.length > 0 && (
            <>
              <div className="bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 border-t border-amber-200">
                Timezone shifted — matches receipt from adjacent day
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {timezoneShifted.map((t) => (
                    <tr key={t.sp.id} className="text-amber-700 bg-amber-50/50">
                      <td className="px-3 py-1.5 font-mono">
                        {new Date(t.sp.createdAt).toLocaleTimeString("en-US", {
                          timeZone: "America/Chicago",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {fmt(t.sp.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-amber-500 text-[10px]">
                        matches {t.customer} on {t.fromDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <table className="w-full text-xs bg-white">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-3 py-1.5 text-left">Time (CST)</th>
                <th className="px-3 py-1.5 text-right">Amount</th>
                <th className="px-3 py-1.5 text-left">Square ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stillUnmatchedSquare.map((sp) => (
                <tr key={sp.id} className="text-red-700">
                  <td className="px-3 py-1.5 font-mono">
                    {new Date(sp.createdAt).toLocaleTimeString("en-US", {
                      timeZone: "America/Chicago",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold">
                    {fmt(sp.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px]">
                    {sp.id}
                  </td>
                </tr>
              ))}
              {unmatchedCSV.length > 0 && (
                <>
                  <tr className="bg-orange-50">
                    <td
                      colSpan={3}
                      className="px-3 py-1.5 text-xs font-medium text-orange-700"
                    >
                      CSV receipts with no matching Square payment
                    </td>
                  </tr>
                  {unmatchedCSV.map((c, i) => (
                    <tr key={i} className="text-orange-700">
                      <td className="px-3 py-1.5">
                        #{c.receiptNo} · {c.customer}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {fmt(c.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 text-[10px]">
                        {c.ccRows.length > 1
                          ? `${c.ccRows.length} rows — may be split card`
                          : "not found in Square"}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showEntries && dateEntries.length > 0 && (
        <div className="mt-2 border border-purple-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-purple-100 text-purple-700">
                <th className="px-3 py-1.5 text-left">Time (CST)</th>
                <th className="px-3 py-1.5 text-right">Gross</th>
                <th className="px-3 py-1.5 text-right">Fee</th>
                <th className="px-3 py-1.5 text-right">Net</th>
                <th className="px-3 py-1.5 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-purple-100">
              {dateEntries
                .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
                .map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-1.5 font-mono text-gray-500">
                      {new Date(e.effectiveAt).toLocaleTimeString("en-US", {
                        timeZone: "America/Chicago",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {fmt(e.grossAmount)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-red-600">
                      {fmt(Math.abs(e.feeAmount))}
                    </td>
                    <td className="px-3 py-1.5 text-right text-green-700 font-medium">
                      {fmt(e.netAmount)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-500">
                      {e.feePercent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              <tr className="bg-purple-50 font-semibold border-t-2 border-purple-200">
                <td className="px-3 py-1.5 text-purple-700">
                  {dateEntries.length} total
                </td>
                <td className="px-3 py-1.5 text-right">{fmt(totalGross)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">
                  {fmt(totalFees)}
                </td>
                <td className="px-3 py-1.5 text-right text-green-700">
                  {fmt(totalNet)}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500">
                  {blendedRate.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Global Recon Panel ───────────────────────────────────────────────────────

function GlobalReconPanel({ recon }: { recon: GlobalReconciliation }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const diff = recon.totalSquareGross - recon.totalCSVCC;
  return (
    <div
      className={`rounded-xl border px-5 py-4 mb-6 ${recon.isBalanced ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">
          Square Reconciliation — this month
        </p>
        {recon.isBalanced ? (
          <span className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" /> Fully balanced
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Off by {fmt(Math.abs(diff))} —{" "}
            {diff > 0 ? "Square higher" : "CSV higher"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-6 text-sm mb-3">
        {[
          { label: "CSV credit card", value: fmt(recon.totalCSVCC) },
          { label: "Square gross", value: fmt(recon.totalSquareGross) },
          ...(recon.totalRefunds > 0
            ? [
                {
                  label: "Refunds",
                  value: `−${fmt(recon.totalRefunds)}`,
                  red: true,
                },
                {
                  label: "Square net",
                  value: fmt(recon.totalSquareGross - recon.totalRefunds),
                },
              ]
            : []),
          {
            label: "Matched",
            value: String(recon.matched.length),
            green: true,
          },
          ...(recon.unmatchedCSV.length > 0
            ? [
                {
                  label: "CSV unmatched",
                  value: String(recon.unmatchedCSV.length),
                  red: true,
                },
              ]
            : []),
          ...(recon.unmatchedSquare.length > 0
            ? [
                {
                  label: "Square unmatched",
                  value: String(recon.unmatchedSquare.length),
                  red: true,
                },
              ]
            : []),
        ].map((s) => (
          <div key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p
              className={`text-lg font-bold ${"red" in s && s.red ? "text-red-600" : "green" in s && s.green ? "text-green-700" : "text-gray-900"}`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      {(recon.unmatchedCSV.length > 0 || recon.unmatchedSquare.length > 0) && (
        <button
          onClick={() => setShowUnmatched(!showUnmatched)}
          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 mb-2"
        >
          {showUnmatched ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          {showUnmatched ? "Hide" : "Show"} unmatched details
        </button>
      )}
      {showUnmatched && (
        <div className="border border-red-200 rounded-lg overflow-hidden text-xs">
          {recon.unmatchedCSV.length > 0 && (
            <>
              <div className="bg-red-100 px-3 py-1.5 font-medium text-red-700">
                CSV with no Square match — may not have been collected via
                Square
              </div>
              <table className="w-full bg-white">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-3 py-1.5 text-left">Date</th>
                    <th className="px-3 py-1.5 text-left">Receipt</th>
                    <th className="px-3 py-1.5 text-left">Customer</th>
                    <th className="px-3 py-1.5 text-left">Ref / Auth</th>
                    <th className="px-3 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recon.unmatchedCSV.map((r) => (
                    <tr
                      key={`${r.receiptNo}_${r.dateKey}`}
                      className="text-red-700"
                    >
                      <td className="px-3 py-1.5 text-gray-500">{r.dateKey}</td>
                      <td className="px-3 py-1.5 font-mono">#{r.receiptNo}</td>
                      <td className="px-3 py-1.5">{r.customer}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">
                        {r.referenceNo || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {fmt(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {recon.unmatchedSquare.length > 0 && (
            <>
              <div className="bg-orange-100 px-3 py-1.5 font-medium text-orange-700 border-t border-orange-200">
                Square payments not in your system
              </div>
              <table className="w-full bg-white">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-3 py-1.5 text-left">Time (CST)</th>
                    <th className="px-3 py-1.5 text-right">Amount</th>
                    <th className="px-3 py-1.5 text-left">Square ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recon.unmatchedSquare.map((sp) => (
                    <tr key={sp.id} className="text-orange-700">
                      <td className="px-3 py-1.5 font-mono">
                        {new Date(sp.createdAt).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {fmt(sp.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px]">
                        {sp.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function MonthCalendar({
  days,
  squareByDate,
  selectedDate,
  onSelectDay,
}: {
  days: DaySummary[];
  squareByDate: Record<string, SquareDayData>;
  selectedDate: string;
  onSelectDay: (dateKey: string) => void;
}) {
  const dayMap = new Map(days.map((d) => [d.dateKey, d]));
  const squareLoaded = Object.keys(squareByDate).length > 0;
  const year =
    days.length > 0
      ? parseInt(days[0].dateKey.split("-")[0])
      : new Date().getFullYear();
  const month =
    days.length > 0
      ? parseInt(days[0].dateKey.split("-")[1]) - 1
      : new Date().getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const getStatus = (dateKey: string) => {
    const day = dayMap.get(dateKey);
    if (!day || !squareLoaded) return "no-data";
    const csvCC = day.byMethod["Credit Card"] || 0;
    if (!squareByDate[dateKey] || csvCC === 0) return "no-data";
    const squareGross = squareByDate[dateKey]?.grossAmount || 0;
    const grossDiff = squareGross - csvCC;
    const squarePayments = squareByDate[dateKey]?.payments || [];
    const allCsvReceipts = days.flatMap((d) =>
      d.receipts.filter((r) => r.methods.includes("Credit Card")),
    );
    const shifted = squarePayments.reduce((s, sp) => {
      const m = allCsvReceipts.find((r) => {
        if (r.dateKey === dateKey) return false;
        return (r.referenceNo || "")
          .split("/")
          .map((c) => c.trim())
          .filter(Boolean)
          .some((code) => normalizeAuth(sp.authCode) === normalizeAuth(code));
      });
      return m ? s + sp.amount : s;
    }, 0);
    const trueGrossDiff = grossDiff - (grossDiff > 0 ? shifted : -shifted);
    return Math.abs(trueGrossDiff) < 0.5 ? "match" : "mismatch";
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} className="h-16 rounded bg-gray-50" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const day = dayMap.get(dateKey);
          const status = getStatus(dateKey);
          const isSelected = selectedDate === dateKey;
          return (
            <button
              key={dateKey}
              onClick={() =>
                day && onSelectDay(selectedDate === dateKey ? "all" : dateKey)
              }
              className={`h-16 rounded p-1.5 text-left transition text-xs border-l-2 ${
                isSelected ? "ring-2 ring-blue-400" : ""
              } ${
                !day
                  ? "bg-gray-50 cursor-default border-transparent"
                  : status === "match"
                    ? "bg-green-50 border-green-500 hover:bg-green-100 cursor-pointer"
                    : status === "mismatch"
                      ? "bg-red-50 border-red-400 hover:bg-red-100 cursor-pointer"
                      : "bg-white border-gray-200 hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <div
                className={`font-medium mb-0.5 ${!day ? "text-gray-300" : "text-gray-600"}`}
              >
                {d}
              </div>
              {day && (
                <>
                  <div
                    className="font-semibold text-gray-900 truncate"
                    style={{ fontSize: "10px" }}
                  >
                    {fmt(day.grandTotal)}
                  </div>
                  <div className="text-gray-400" style={{ fontSize: "10px" }}>
                    {day.receipts.length}r
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-200 inline-block" />
          Match
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-100 inline-block" />
          Mismatch
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-100 inline-block" />
          No Square data
        </span>
        <span className="text-gray-400 ml-auto">
          Click a day to filter · click again to clear
        </span>
      </div>
    </div>
  );
}

// ─── Day Block ────────────────────────────────────────────────────────────────

function DayBlock({
  day,
  onSaveReceipt,
  squareByDate,
  squarePayouts,
  allDays,
}: {
  day: DaySummary;
  onSaveReceipt: (
    id: string,
    rows: ReceiptRow[],
    notes: string,
  ) => Promise<void>;
  squareByDate: Record<string, SquareDayData>;
  squarePayouts: PayoutWithEntries[];
  allDays: DaySummary[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const csvCCTotal = day.byMethod["Credit Card"] || 0;
  const allCsvReceipts = allDays.flatMap((d) =>
    d.receipts.filter((r) => r.methods.includes("Credit Card")),
  );

  const statusPill =
    squareByDate[day.dateKey] && csvCCTotal > 0
      ? (() => {
          const squareGross = squareByDate[day.dateKey]?.grossAmount || 0;
          const grossDiff = squareGross - csvCCTotal;
          const squarePayments = squareByDate[day.dateKey]?.payments || [];
          const shifted = squarePayments.reduce((s, sp) => {
            const m = allCsvReceipts.find((r) => {
              if (r.dateKey === day.dateKey) return false;
              return (r.referenceNo || "")
                .split("/")
                .map((c) => c.trim())
                .filter(Boolean)
                .some(
                  (code) => normalizeAuth(sp.authCode) === normalizeAuth(code),
                );
            });
            return m ? s + sp.amount : s;
          }, 0);
          const trueGrossDiff =
            grossDiff - (grossDiff > 0 ? shifted : -shifted);
          return Math.abs(trueGrossDiff) < 0.5 ? (
            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
              ✓ match
            </span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
              ⚠ mismatch
            </span>
          );
        })()
      : null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            {day.dateLabel}
          </h2>
          <span className="text-sm text-gray-400">
            {day.receipts.length} receipt{day.receipts.length !== 1 ? "s" : ""}
          </span>
          {statusPill}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">
            {fmt(day.grandTotal)}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </div>
      </button>
      {!collapsed && (
        <>
          <div className="space-y-2 mb-3">
            {day.receipts.map((r) => (
              <ReceiptCard
                key={`${r.receiptNo}_${r.custId}`}
                receipt={r}
                onSave={onSaveReceipt}
              />
            ))}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-wrap items-center gap-4 text-sm mb-2">
            <div>
              <span className="text-blue-600 text-xs">Premium</span>
              <p className="font-semibold text-blue-900">
                {fmt(day.totalPremium)}
              </p>
            </div>
            <div>
              <span className="text-blue-600 text-xs">Agency fees</span>
              <p className="font-semibold text-blue-900">
                {fmt(day.totalFees)}
              </p>
            </div>
            <div className="h-8 w-px bg-blue-200" />
            {Object.entries(day.byMethod)
              .sort((a, b) => b[1] - a[1])
              .map(([method, total]) => (
                <div key={method} className="flex items-center gap-1.5">
                  <Badge method={method} />
                  <span className="font-semibold text-gray-800">
                    {fmt(total)}
                  </span>
                </div>
              ))}
          </div>
          {csvCCTotal > 0 && (
            <SquarePanel
              dateKey={day.dateKey}
              csvCCTotal={csvCCTotal}
              squareDay={squareByDate[day.dateKey]}
              payouts={squarePayouts}
              csvReceipts={day.receipts.filter((r) =>
                r.methods.includes("Credit Card"),
              )}
              allCsvReceipts={allCsvReceipts}
              squareByDate={squareByDate}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getMonthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function AccountingPage() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");

  const [squareByDate, setSquareByDate] = useState<
    Record<string, SquareDayData>
  >({});
  const [squarePayouts, setSquarePayouts] = useState<PayoutWithEntries[]>([]);
  const [squareLoading, setSquareLoading] = useState(false);
  const [squareError, setSquareError] = useState("");
  const [globalRecon, setGlobalRecon] = useState<GlobalReconciliation | null>(
    null,
  );

  const monthKey = getMonthKey(viewYear, viewMonth);

  useEffect(() => {
    const savedSession = localStorage.getItem("admin_session");
    if (!savedSession) {
      window.location.href = "/admin";
      return;
    }
    try {
      const session = JSON.parse(savedSession);
      if (Date.now() >= session.expiresAt) {
        localStorage.removeItem("admin_session");
        window.location.href = "/admin";
      } else {
        setIsCheckingAuth(false);
      }
    } catch {
      localStorage.removeItem("admin_session");
      window.location.href = "/admin";
    }
  }, []);

  useEffect(() => {
    if (isCheckingAuth) return;
    loadFromDB();
    setSquareByDate({});
    setSquarePayouts([]);
    setGlobalRecon(null);
    setSelectedDate("all");
  }, [monthKey]);

  const loadFromDB = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/receipts?month=${monthKey}`);
      const receipts: Receipt[] = await res.json();
      setDays(groupIntoDays(receipts));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const fetchSquareData = async () => {
    if (!days.length) return;
    setSquareLoading(true);
    setSquareError("");
    try {
      const begin = `${monthKey}-01`;
      const lastDay = new Date(viewYear, viewMonth + 1, 1); // first day of next month = end
      const end = lastDay.toISOString().split("T")[0];
      const [paymentsRes, payoutsRes] = await Promise.all([
        fetch(`/api/accounting/square-payments?begin=${begin}&end=${end}`),
        fetch(
          `/api/accounting/square-payout-entries?begin=${begin}&end=${end}`,
        ),
      ]);
      if (!paymentsRes.ok || !payoutsRes.ok) {
        setSquareError("Square API error — check your access token");
        return;
      }
      const paymentsData = await paymentsRes.json();
      const payoutsData = await payoutsRes.json();
      const byDate = paymentsData.byDate || {};
      // Only keep CST dates that belong to the current month
      // Late-night payments from the prior month's last day get filtered out
      const filteredByDate: Record<string, SquareDayData> = Object.fromEntries(
        Object.entries(byDate as Record<string, SquareDayData>).filter(
          ([dateKey]) => dateKey.startsWith(monthKey),
        ),
      );
      setSquareByDate(filteredByDate);
      setSquarePayouts(payoutsData.payouts || []);
      setGlobalRecon(buildGlobalReconciliation(days, filteredByDate));
    } catch {
      setSquareError("Failed to fetch Square data");
    } finally {
      setSquareLoading(false);
    }
  };

  const handleFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportResult("");
      const reader = new FileReader();
      reader.onload = async (e) => {
        const receipts = processCSVToReceipts(
          parseCSV(e.target?.result as string),
        );
        try {
          const res = await fetch("/api/accounting/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receipts }),
          });
          const data = await res.json();
          setImportResult(`✓ ${data.inserted} new, ${data.updated} updated`);
          await loadFromDB();
        } catch {
          setImportResult("Import failed");
        } finally {
          setImporting(false);
        }
      };
      reader.readAsText(file);
    },
    [monthKey],
  );

  const handleSaveReceipt = async (
    id: string,
    rows: ReceiptRow[],
    notes: string,
  ) => {
    await fetch(`/api/accounting/receipts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, notes }),
    });
    await loadFromDB();
  };

  const totalRevenue = days.reduce((s, d) => s + d.grandTotal, 0);
  const totalPremium = days.reduce((s, d) => s + d.totalPremium, 0);
  const totalFees = days.reduce((s, d) => s + d.totalFees, 0);
  const totalCC = days.reduce(
    (s, d) => s + (d.byMethod["Credit Card"] || 0),
    0,
  );
  const squareGrossTotal = Object.values(squareByDate).reduce(
    (s, d) => s + d.grossAmount,
    0,
  );
  const shown =
    selectedDate === "all"
      ? days
      : days.filter((d) => d.dateKey === selectedDate);

  const changeMonth = (dir: number) => {
    const d = new Date(viewYear, viewMonth + dir, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/accounting">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => (window.location.href = "/admin")}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1.5 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Back to Admin
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
                {importResult && (
                  <p
                    className={`text-sm mt-0.5 ${importResult.startsWith("✓") ? "text-green-600" : "text-red-500"}`}
                  >
                    {importResult}
                  </p>
                )}
                {squareError && (
                  <p className="text-sm mt-0.5 text-red-500">{squareError}</p>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {/* Month navigator */}
                <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => changeMonth(-1)}
                    className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    ←
                  </button>
                  <span className="px-3 py-2 text-sm font-medium text-gray-900 min-w-[130px] text-center">
                    {getMonthLabel(viewYear, viewMonth)}
                  </span>
                  <button
                    onClick={() => changeMonth(1)}
                    className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    →
                  </button>
                </div>
                <button
                  onClick={loadFromDB}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-1.5 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                {days.length > 0 && (
                  <button
                    onClick={fetchSquareData}
                    disabled={squareLoading}
                    className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 text-sm font-medium ${squareLoading ? "bg-purple-300 text-white cursor-not-allowed" : "bg-purple-600 text-white hover:bg-purple-700"}`}
                  >
                    {squareLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Fetching…
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Square Reconcile
                      </>
                    )}
                  </button>
                )}
                <label
                  className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer text-sm font-medium ${importing ? "bg-blue-400 text-white cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  <Upload className="w-4 h-4" />
                  {importing ? "Importing…" : "Import CSV"}
                  <input
                    type="file"
                    accept=".csv,.CSV"
                    className="hidden"
                    disabled={importing}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = "";
                    }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Empty */}
          {!days.length && !loading && (
            <label className="block border-2 border-dashed border-gray-300 rounded-xl p-16 text-center bg-white cursor-pointer hover:border-blue-400 transition">
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700 mb-1">
                Import Transaction Detail CSV for{" "}
                {getMonthLabel(viewYear, viewMonth)}
              </p>
              <p className="text-sm text-gray-500">
                Data saved to MongoDB — switch months anytime
              </p>
              <input
                type="file"
                accept=".csv,.CSV"
                className="hidden"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          )}

          {loading && (
            <div className="bg-white rounded-xl p-16 text-center shadow-sm">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                Loading {getMonthLabel(viewYear, viewMonth)}…
              </p>
            </div>
          )}

          {days.length > 0 && !loading && (
            <>
              {/* Summary cards */}
              {(() => {
                const totalCash = days.reduce(
                  (s, d) => s + (d.byMethod["Cash"] || 0),
                  0,
                );
                const totalZelle = days.reduce((s, d) => {
                  // Zelle can appear as E-Payment with ref "Zelle" or as its own method
                  // const ePayment = d.byMethod["E-Payment"] || 0;
                  const zelle = d.byMethod["Zelle"] || 0;
                  // Check receipts for Zelle ref to separate from other E-Payments
                  const zelleFromEPayment = d.receipts.reduce((rs, r) => {
                    const isZelle =
                      (r.referenceNo || "").toLowerCase() === "zelle";
                    if (!isZelle) return rs;
                    return (
                      rs +
                      r.rows
                        .filter((row) => row.method === "E-Payment")
                        .reduce((s, row) => s + row.total, 0)
                    );
                  }, 0);
                  return s + zelle + zelleFromEPayment;
                }, 0);

                return (
                  <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                    {/* Row 1 — totals */}
                    <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">
                          Total collected
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {fmt(totalRevenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Premium</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {fmt(totalPremium)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">
                          Agency fees
                        </p>
                        <p
                          className={`text-2xl font-bold ${totalFees >= 0 ? "text-green-700" : "text-red-600"}`}
                        >
                          {fmt(totalFees)}
                        </p>
                      </div>
                    </div>

                    {/* Row 2 — payment methods */}
                    <div className="grid grid-cols-4 gap-4">
                      {/* Credit card */}
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          <p className="text-xs text-blue-700 font-medium">
                            Credit card
                          </p>
                        </div>
                        <p className="text-base font-bold text-gray-900">
                          {fmt(totalCC)}
                        </p>
                        {squareGrossTotal > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-blue-100">
                            <p className="text-[10px] text-blue-600">
                              Square gross
                            </p>
                            <p
                              className={`text-sm font-semibold ${Math.abs(squareGrossTotal - totalCC) > 0.5 ? "text-red-600" : "text-green-700"}`}
                            >
                              {fmt(squareGrossTotal)}
                              {Math.abs(squareGrossTotal - totalCC) > 0.5 && (
                                <span className="text-[10px] ml-1 font-normal">
                                  off by{" "}
                                  {fmt(Math.abs(squareGrossTotal - totalCC))}
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Cash */}
                      <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          <p className="text-xs text-green-700 font-medium">
                            Cash
                          </p>
                        </div>
                        <p className="text-base font-bold text-gray-900">
                          {fmt(totalCash)}
                        </p>
                        <p className="text-[10px] text-green-600 mt-1.5">
                          In-office payments
                        </p>
                      </div>

                      {/* Zelle */}
                      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                          <p className="text-xs text-indigo-700 font-medium">
                            Zelle
                          </p>
                        </div>
                        <p className="text-base font-bold text-gray-900">
                          {fmt(totalZelle)}
                        </p>
                        <p className="text-[10px] text-indigo-600 mt-1.5">
                          E-Payment / Zelle ref
                        </p>
                      </div>

                      {/* Other */}
                      {(() => {
                        const knownMethods = [
                          "Credit Card",
                          "Cash",
                          "E-Payment",
                          "Zelle",
                        ];
                        const other = days.reduce((s, d) => {
                          return (
                            s +
                            Object.entries(d.byMethod)
                              .filter(([m]) => !knownMethods.includes(m))
                              .reduce((ms, [, v]) => ms + v, 0)
                          );
                        }, 0);
                        // Non-zelle E-Payment
                        const nonZelleEPayment = days.reduce((s, d) => {
                          return (
                            s +
                            d.receipts.reduce((rs, r) => {
                              const isZelle =
                                (r.referenceNo || "").toLowerCase() === "zelle";
                              if (isZelle) return rs;
                              return (
                                rs +
                                r.rows
                                  .filter((row) => row.method === "E-Payment")
                                  .reduce((ss, row) => ss + row.total, 0)
                              );
                            }, 0)
                          );
                        }, 0);
                        return (
                          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                              <p className="text-xs text-gray-600 font-medium">
                                Other
                              </p>
                            </div>
                            <p className="text-base font-bold text-gray-900">
                              {fmt(other + nonZelleEPayment)}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1.5">
                              Check, Forward, Wire, etc.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              <AgencyFeeChart activeMonth={monthKey} />

              {/* Global recon */}
              {globalRecon && <GlobalReconPanel recon={globalRecon} />}

              {/* Calendar */}
              <MonthCalendar
                days={days}
                squareByDate={squareByDate}
                selectedDate={selectedDate}
                onSelectDay={setSelectedDate}
              />

              {/* Day filter indicator */}
              {selectedDate !== "all" && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600">
                    Showing {formatDateLabel(selectedDate)}
                  </p>
                  <button
                    onClick={() => setSelectedDate("all")}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Show all days
                  </button>
                </div>
              )}

              {/* Day list */}
              {shown.map((day) => (
                <DayBlock
                  key={day.dateKey}
                  day={day}
                  onSaveReceipt={handleSaveReceipt}
                  squareByDate={squareByDate}
                  squarePayouts={squarePayouts}
                  allDays={days}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
