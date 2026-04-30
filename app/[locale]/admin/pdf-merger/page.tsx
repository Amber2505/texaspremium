// app/[locale]/admin/pdf-merger/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Upload,
  Download,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlusCircle,
  CreditCard,
  Landmark,
  Ban,
  Calendar,
  DollarSign,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

// ─── DOCUMENT SETS PER POLICY TYPE ───────────────────────────────────────────
type TemplateEntry = { key: string; label: string };

const DOCUMENT_SETS: Record<string, TemplateEntry[]> = {
  Auto: [
    { key: "Acknowledgement form", label: "Acknowledgement of Coverage" },
    { key: "515A Exclusion form", label: "Form 515A – Driver Exclusion" },
    { key: "Discount form", label: "Discount & Document Compliance" },
    { key: "Non Business use", label: "Statement of Non-Business Use" },
    { key: "PIP Rejection form", label: "Texas PIP Coverage" },
    { key: "Uninsured Rejection form", label: "Texas UM/UIM Coverage" },
    { key: "Verification letter", label: "Verification of Policy Information" },
  ],
  // Commercial Auto: identical to Auto but WITHOUT Non-Business Use form
  CommercialAuto: [
    { key: "Acknowledgement form", label: "Acknowledgement of Coverage" },
    { key: "515A Exclusion form", label: "Form 515A – Driver Exclusion" },
    { key: "Discount form", label: "Discount & Document Compliance" },
    { key: "PIP Rejection form", label: "Texas PIP Coverage" },
    { key: "Uninsured Rejection form", label: "Texas UM/UIM Coverage" },
    { key: "Verification letter", label: "Verification of Policy Information" },
  ],
};

const POLICY_TYPES = [
  { value: "Auto", emoji: "🚗", label: "Personal Auto" },
  { value: "CommercialAuto", emoji: "🚛", label: "Commercial Auto" },
];

type PaymentMethod = "none" | "cc" | "eft";
type ReceiptType = "card" | "cash";

interface ExtraDoc {
  id: string;
  file: File;
  label: string;
}

interface ReceiptInfo {
  customerName: string | null;
  policyNumber: string | null;
  companyName: string | null;
  paidAmount: string | null;
  notAReceipt?: boolean;
}

const OFFICE_RECEIPT_STAMPS = {
  paidAmount: { x: 90, y: 360 },
  dueDate: { x: 198, y: 335 },
  monthlyAmount: { x: 320, y: 338 },
};

// ─── Styled sub-components ────────────────────────────────────────────────────
function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">
      {children}
    </h2>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{" "}
      {required && <span className="text-rose-400 normal-case">*</span>}
    </label>
  );
}

function StyledInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder-gray-300 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    />
  );
}

function UploadBox({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/40 transition-all group text-center"
    >
      {children}
    </button>
  );
}

function UploadedFile({
  name,
  size,
  label,
  onRemove,
}: {
  name: string;
  size: number;
  label?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <FileText className="w-4 h-4 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-emerald-800 truncate">{name}</p>
        <p className="text-xs text-emerald-500">
          {(size / 1024).toFixed(0)} KB{label ? ` · ${label}` : ""}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="w-6 h-6 rounded-full flex items-center justify-center text-emerald-400 hover:text-rose-500 hover:bg-rose-50 transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PdfMergerPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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
        return;
      }
      setIsCheckingAuth(false);
    } catch {
      localStorage.removeItem("admin_session");
      window.location.href = "/admin";
    }
  }, []);

  const [policyType, setPolicyType] = useState("Auto");
  const [nonOwner, setNonOwner] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cc");
  const [receiptType, setReceiptType] = useState<ReceiptType>("card");
  const [customerName, setCustomerName] = useState("");
  const [companyApp, setCompanyApp] = useState<File | null>(null);
  const [extraDocs, setExtraDocs] = useState<ExtraDoc[]>([]);
  const [officeReceipt, setOfficeReceipt] = useState<File | null>(null);
  const [ccReceipts, setCcReceipts] = useState<File[]>([]);
  const [merging, setMerging] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [noReceipt, setNoReceipt] = useState(false);
  const [paidInFull, setPaidInFull] = useState(false);
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo | null>(null);
  const [extractingReceipt, setExtractingReceipt] = useState(false);
  const [extractionNote, setExtractionNote] = useState<string | null>(null);

  const companyAppRef = useRef<HTMLInputElement>(null);
  const officeReceiptRef = useRef<HTMLInputElement>(null);
  const ccReceiptRef = useRef<HTMLInputElement>(null);

  const templates = DOCUMENT_SETS[policyType] ?? [];
  const hasTemplates = templates.length > 0;

  const isPolicyTbd = receiptInfo?.policyNumber?.trim().toUpperCase() === "TBD";

  const receiptFieldsReady =
    !officeReceipt ||
    (paidInFull
      ? !!paidAmount.trim()
      : !!(paidAmount.trim() && nextDueDate.trim() && monthlyAmount.trim()));

  const canMerge =
    customerName.trim() &&
    companyApp &&
    !isPolicyTbd &&
    (noReceipt ||
      (officeReceipt && receiptFieldsReady && !receiptInfo?.notAReceipt)) &&
    (noReceipt || receiptType === "cash" || ccReceipts.length > 0);

  // ─── PDF.js loader ──────────────────────────────────────────────────────────
  const loadPdfJs = async () => {
    await new Promise<void>((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const pdfjsLib = (window as any).pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return pdfjsLib;
  };

  // ─── Extract all info from the Texas Premium receipt ────────────────────────
  // Coordinate-based: anchor on known fixed items (email, column headers).
  const extractFromReceipt = async (file: File): Promise<ReceiptInfo> => {
    const empty: ReceiptInfo = {
      customerName: null,
      policyNumber: null,
      companyName: null,
      paidAmount: null,
    };
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const rawContent = await page.getTextContent();

      // Build positioned items — PDF y is bottom-up (higher = higher on page)
      const items: Array<{ text: string; x: number; y: number }> = [];
      for (const item of rawContent.items as any[]) {
        if (!item.str?.trim()) continue;
        const tx = item.transform;
        items.push({ text: item.str.trim(), x: tx[4], y: tx[5] });
      }

      // ── Customer name ─────────────────────────────────────────────────────
      // Strategy: find the "Description" table header (reliable table boundary),
      // then find items that are ABOVE it (higher y) and BELOW the email,
      // in the left half of the page only. The customer name is the topmost of those.
      let customerName: string | null = null;
      const emailItem = items.find((it) =>
        it.text.toLowerCase().includes("support@texaspremiumins"),
      );
      const descHeaderForName = items.find((it) => it.text === "Description");
      if (emailItem && descHeaderForName) {
        const candidates = items
          .filter(
            (it) =>
              it.y < emailItem.y - 1 && // below email
              it.y > descHeaderForName.y + 1 && // above the table
              it.x < 200 && // left half of page only
              /^[A-Za-z]/.test(it.text) && // starts with a letter
              !it.text.includes("@") &&
              !/^\d/.test(it.text) && // not a number/address line
              it.text.length > 2 &&
              // exclude known non-name strings
              !/^(Phone|Fax|Email|Texas Premium|Farmers|Dallas|Carrollton|Arlington)/i.test(
                it.text,
              ),
          )
          .sort((a, b) => b.y - a.y); // closest below email first
        customerName = candidates[0]?.text ?? null;
      }

      // ── Policy number ─────────────────────────────────────────────────────
      // Policy numbers are directly below the "Policy No" column header.
      // Accept any alphanumeric token with 6+ chars (covers both formats:
      // "4362963-TX-PP-001" and "CCB01461797").
      let policyNumber: string | null = null;
      const policyColHeader = items.find((it) => it.text === "Policy No");
      if (policyColHeader) {
        const below = items
          .filter(
            (it) =>
              it.y < policyColHeader.y - 2 &&
              it.x >= policyColHeader.x - 10 &&
              it.x <= policyColHeader.x + 100 &&
              /^[A-Z0-9][A-Z0-9\-]{5,}$/i.test(it.text), // 6+ alphanumeric/dash chars
          )
          .sort((a, b) => b.y - a.y);
        policyNumber = below[0]?.text ?? null;
      }

      // ── Company name ──────────────────────────────────────────────────────
      // Anchor: "Description" column header (in the table, left-most column).
      // Company name is the first text item directly below it.
      let companyName: string | null = null;
      const descHeader = items.find((it) => it.text === "Description");
      if (descHeader) {
        const below = items
          .filter(
            (it) =>
              it.y < descHeader.y - 2 &&
              it.x >= descHeader.x - 10 && // same left-column x
              it.x <= descHeader.x + 120 &&
              /^[A-Za-z]/.test(it.text) &&
              it.text !== "Description",
          )
          .sort((a, b) => b.y - a.y); // closest below first
        companyName = below[0]?.text ?? null;
      }

      // ── Amount paid ───────────────────────────────────────────────────────
      // Anchor: "Paid" column header (right-most column in table).
      // First number below it in ##.## format = the amount for this transaction.
      let paidAmount: string | null = null;
      // There may be two "Paid" items (header + label) — pick the one in the table
      // (lower on page = lower y value)
      const paidHeaders = items
        .filter((it) => it.text === "Paid")
        .sort((a, b) => b.y - a.y); // topmost first = table header
      const paidHeader = paidHeaders[0] ?? null;
      if (paidHeader) {
        const below = items
          .filter(
            (it) =>
              it.y < paidHeader.y - 2 &&
              Math.abs(it.x - paidHeader.x) < 40 &&
              /^\d[\d,]*\.\d{2}$/.test(it.text),
          )
          .sort((a, b) => b.y - a.y); // first data row below header
        paidAmount = below[0]?.text?.replace(/,/g, "") ?? null;
      }

      // ── Validate this is a Texas Premium receipt ─────────────────────────
      // Only the Office Copy is accepted — Customer Copy is not allowed.
      const isOfficeCopy = items.some((it) => /^OFFICE COPY$/i.test(it.text));
      if (!isOfficeCopy) {
        return { ...empty, notAReceipt: true };
      }

      return { customerName, policyNumber, companyName, paidAmount };
    } catch {
      return empty;
    }
  };

  // ─── Handle office receipt upload ───────────────────────────────────────────
  const handleOfficeReceiptChange = async (file: File | null) => {
    setOfficeReceipt(file);
    setReceiptInfo(null);
    setExtractionNote(null);

    if (!file) {
      setPaidAmount("");
      return;
    }

    setExtractingReceipt(true);
    const info = await extractFromReceipt(file);
    setExtractingReceipt(false);
    setReceiptInfo(info);

    if (info.paidAmount) {
      setPaidAmount(info.paidAmount);
    }

    // Auto-fill customer name if not already set
    if (info.customerName && !customerName.trim()) {
      setCustomerName(info.customerName);
    }

    const extracted: string[] = [];
    if (info.paidAmount) extracted.push("amount");
    if (info.policyNumber) extracted.push("policy #");
    if (info.companyName) extracted.push("company");
    if (info.customerName) extracted.push("customer name");

    if (extracted.length > 0) {
      setExtractionNote(`Auto-filled from receipt: ${extracted.join(", ")}`);
    } else {
      setExtractionNote("Could not read receipt — enter details manually");
    }
  };

  // ─── Auto-recompute PIF due date when expiration date changes ─────────────
  useEffect(() => {
    if (paidInFull && expirationDate) {
      const computed = computePifDueDate(expirationDate);
      if (computed) setNextDueDate(computed);
    }
  }, [paidInFull, expirationDate]);

  // ─── Company app upload ──────────────────────────────────────────────────────
  const handleCompanyAppFiles = async (files: FileList) => {
    const arr = Array.from(files).filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (arr.length === 0) return;

    if (companyApp) {
      const newExtras: ExtraDoc[] = arr.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        label: f.name.replace(/\.pdf$/i, ""),
      }));
      setExtraDocs((prev) => [...prev, ...newExtras]);
    } else {
      const [winner, ...others] = arr;
      setCompanyApp(winner);
      if (others.length > 0) {
        const newExtras: ExtraDoc[] = others.map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          label: f.name.replace(/\.pdf$/i, ""),
        }));
        setExtraDocs((prev) => [...prev, ...newExtras]);
      }
    }
    if (companyAppRef.current) companyAppRef.current.value = "";
  };

  // ─── Paid-in-full due date helper ───────────────────────────────────────────
  // Handles both HTML date input format (YYYY-MM-DD) and MM/DD/YYYY.
  const computePifDueDate = (expirationDateStr: string): string | null => {
    try {
      const parts = expirationDateStr.split(/[\/\-]/);
      if (parts.length !== 3) return null;

      let y: number, m: number, d: number;

      if (parts[0].length === 4) {
        // YYYY-MM-DD (from HTML date input)
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
        d = parseInt(parts[2]);
      } else {
        // MM/DD/YYYY or MM-DD-YYYY
        m = parseInt(parts[0]);
        d = parseInt(parts[1]);
        y = parseInt(parts[2]);
        if (y < 100) y += 2000;
      }

      const date = new Date(y, m - 1, d);
      if (isNaN(date.getTime())) return null;
      date.setDate(date.getDate() - 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    } catch {
      return null;
    }
  };

  // ─── Merge ──────────────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (!canMerge) return;
    setMerging(true);
    setStatus(null);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      const font = await merged.embedFont(StandardFonts.Helvetica);
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

      const DATE_STAMPS: Record<string, { x: number; y: number }[]> = {
        "Acknowledgement form": [{ x: 440, y: 96 }],
        "Discount form": [{ x: 345, y: 143 }],
        "Non Business use": [{ x: 435, y: 318 }],
        "PIP Rejection form": [{ x: 130, y: 265 }],
        "Uninsured Rejection form": [{ x: 132, y: 102 }],
        "Verification letter": [{ x: 395, y: 137 }],
        "Recurring CC form": [{ x: 415, y: 128 }],
        "EFT form general": [{ x: 438, y: 102 }],
        "Non owner policy consent form": [{ x: 450, y: 95 }],
      };

      const addPdf = async (bytes: Uint8Array, templateKey?: string) => {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((page, i) => {
          merged.addPage(page);
          if (i === 0 && templateKey && DATE_STAMPS[templateKey]) {
            DATE_STAMPS[templateKey].forEach(({ x, y }) => {
              page.drawText(dateStr, {
                x,
                y,
                size: 10,
                font,
                color: rgb(0, 0, 0),
              });
            });
          }
        });
      };

      const addOfficeReceipt = async (bytes: Uint8Array) => {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((page, i) => {
          merged.addPage(page);
          if (i === 0) {
            // Paid amount
            page.drawText(`$${paidAmount.trim()}`, {
              x: OFFICE_RECEIPT_STAMPS.paidAmount.x,
              y: OFFICE_RECEIPT_STAMPS.paidAmount.y,
              size: 10,
              font,
              color: rgb(0, 0, 0),
            });
            // Due date — PIF shows "Paid In Full", otherwise formatted date
            const dueDateText = paidInFull
              ? "Paid In Full"
              : (() => {
                  const [y, m, d] = nextDueDate.split("-");
                  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
                })();
            page.drawText(dueDateText, {
              x: OFFICE_RECEIPT_STAMPS.dueDate.x,
              y: OFFICE_RECEIPT_STAMPS.dueDate.y,
              size: paidInFull ? 8 : 10,
              font,
              color: rgb(0, 0, 0),
            });
            // Monthly amount — PIF shows "To Be Determined"
            const monthlyText = paidInFull
              ? "To Be Determined"
              : `$${monthlyAmount.trim()}`;
            page.drawText(monthlyText, {
              x: OFFICE_RECEIPT_STAMPS.monthlyAmount.x,
              y: OFFICE_RECEIPT_STAMPS.monthlyAmount.y,
              size: paidInFull ? 8 : 10,
              font,
              color: rgb(0, 0, 0),
            });
          }
        });
      };

      const fetchTemplate = async (key: string): Promise<Uint8Array> => {
        const res = await fetch(`/templates/${encodeURIComponent(key)}.pdf`);
        if (!res.ok) throw new Error(`Could not load template: ${key}.pdf`);
        return new Uint8Array(await res.arrayBuffer());
      };

      const readFile = (file: File): Promise<Uint8Array> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) =>
            resolve(new Uint8Array(e.target!.result as ArrayBuffer));
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });

      if (!hasTemplates) {
        await addPdf(await readFile(companyApp!));
        for (const extra of extraDocs) await addPdf(await readFile(extra.file));
      } else {
        await addPdf(await fetchTemplate(templates[0].key), templates[0].key);
        await addPdf(await readFile(companyApp!));
        for (const extra of extraDocs) await addPdf(await readFile(extra.file));
        for (const t of templates.slice(1))
          await addPdf(await fetchTemplate(t.key), t.key);
        if (paymentMethod === "cc")
          await addPdf(
            await fetchTemplate("Recurring CC form"),
            "Recurring CC form",
          );
        else if (paymentMethod === "eft")
          await addPdf(
            await fetchTemplate("EFT form general"),
            "EFT form general",
          );
        if (nonOwner)
          await addPdf(
            await fetchTemplate("Non owner policy consent form"),
            "Non owner policy consent form",
          );
      }

      if (!noReceipt) {
        await addOfficeReceipt(await readFile(officeReceipt!));
        if (receiptType === "card") {
          for (const receipt of ccReceipts)
            await addPdf(await readFile(receipt));
        }
      }

      const datePart = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}-${today.getFullYear()}`;
      const timePart = `${pad(today.getHours())}-${pad(today.getMinutes())}`;
      const safeName = customerName.trim().replace(/\s+/g, "_");
      const policyLabel = nonOwner
        ? `${policyType === "CommercialAuto" ? "CommercialAuto" : policyType}_NonOwner`
        : policyType;
      const receiptLabel = noReceipt
        ? "_NoReceipt"
        : receiptType === "cash"
          ? "_Cash"
          : "";
      const pifLabel = paidInFull ? "_PIF" : "";
      const filename = `${safeName}_${policyLabel}${receiptLabel}${pifLabel}_${datePart}_${timePart}.pdf`;

      // ── Save to MongoDB before generating the PDF (skip if no receipt) ──
      if (!noReceipt) {
        try {
          await fetch("/api/pdf-extracted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              customerName: customerName.trim(),
              policyNumber: receiptInfo?.policyNumber || null,
              companyName: receiptInfo?.companyName || null,
              paidAmount: paidAmount.trim() || null,
              nextDueDate: paidInFull ? null : nextDueDate || null,
              monthlyAmount: paidInFull ? "0.00" : monthlyAmount.trim() || null,
              paidInFull,
              policyType,
              nonOwner,
              paymentMethod,
              receiptType,
              noReceipt,
              mergedFilename: filename,
            }),
          });
        } catch (saveErr) {
          console.error("Failed to save to pdf-extracted:", saveErr);
          // Non-fatal — continue with merge regardless
        }
      }

      const pdfBytes = await merged.save();
      const blob = new Blob([pdfBytes as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStatus({ type: "success", message: `Downloaded: ${filename}` });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Merge failed.",
      });
    } finally {
      setMerging(false);
    }
  };

  // ─── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setCustomerName("");
    setExpirationDate("");
    setPolicyType("Auto");
    setNonOwner(false);
    setPaymentMethod("cc");
    setReceiptType("card");
    setCompanyApp(null);
    setExtraDocs([]);
    setOfficeReceipt(null);
    setCcReceipts([]);
    setPaidAmount("");
    setNextDueDate("");
    setMonthlyAmount("");
    setExtractionNote(null);
    setStatus(null);
    setNoReceipt(false);
    setPaidInFull(false);
    setReceiptInfo(null);
    if (companyAppRef.current) companyAppRef.current.value = "";
    if (officeReceiptRef.current) officeReceiptRef.current.value = "";
    if (ccReceiptRef.current) ccReceiptRef.current.value = "";
  };

  const handleRemoveExtraDoc = (id: string) =>
    setExtraDocs((prev) => prev.filter((d) => d.id !== id));
  const handleUpdateExtraLabel = (id: string, label: string) =>
    setExtraDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, label } : d)),
    );

  // ─── Merge order preview ─────────────────────────────────────────────────────
  const afterCompany = extraDocs.length;
  const baseCount = hasTemplates ? templates.length : 0;
  const paymentOffset = paymentMethod !== "none" ? 1 : 0;
  const nonOwnerOffset = nonOwner ? 1 : 0;

  const displayDocs = [
    ...(hasTemplates
      ? [{ num: 1, label: templates[0].label, type: "static" as const }]
      : []),
    {
      num: 2,
      label: "Company Application / Policy Package",
      type: "upload" as const,
    },
    ...extraDocs.map((d, i) => ({
      num: 3 + i,
      label: d.label || `Extra Document ${i + 1}`,
      type: "extra" as const,
    })),
    ...(hasTemplates
      ? templates.slice(1).map((t, i) => ({
          num: 2 + afterCompany + 1 + i,
          label: t.label,
          type: "static" as const,
        }))
      : []),
    ...(paymentMethod !== "none"
      ? [
          {
            num: baseCount + afterCompany + 2,
            label:
              paymentMethod === "cc"
                ? "Recurring CC Authorization"
                : "EFT Authorization (Bank on File)",
            type: "static" as const,
          },
        ]
      : []),
    ...(nonOwner
      ? [
          {
            num: baseCount + afterCompany + 2 + paymentOffset,
            label: "Non-Owner Policy Consent Form",
            type: "static" as const,
          },
        ]
      : []),
    ...(!noReceipt
      ? [
          {
            num: baseCount + afterCompany + 2 + paymentOffset + nonOwnerOffset,
            label: "Office Receipt",
            type: "upload" as const,
          },
        ]
      : []),
    ...(!noReceipt && receiptType === "card"
      ? ccReceipts.length > 0
        ? ccReceipts.map((f, i) => ({
            num:
              baseCount + afterCompany + 3 + paymentOffset + nonOwnerOffset + i,
            label: `CC Receipt${ccReceipts.length > 1 ? ` (Card ${i + 1})` : ""} — ${f.name}`,
            type: "upload" as const,
          }))
        : [
            {
              num:
                baseCount + afterCompany + 3 + paymentOffset + nonOwnerOffset,
              label: "Credit Card Receipt",
              type: "upload" as const,
            },
          ]
      : []),
  ].sort((a, b) => a.num - b.num);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePreview = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      {/* Top nav bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = "/admin")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Admin
            </button>
            <span className="text-gray-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">
                PDF Merger
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition font-medium"
            >
              Reset
            </button>
            <button
              onClick={handleMerge}
              disabled={!canMerge || merging}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-blue-700 text-white font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Merging…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Merge & Download
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {status && (
          <div
            className={`flex items-center gap-3 p-4 rounded-2xl mb-6 text-sm font-medium ${status.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}
          >
            {status.type === "success" ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {status.message}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-5">
            {/* Policy Setup */}
            <SectionCard>
              <SectionTitle>Policy Setup</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <FieldLabel required>Customer name</FieldLabel>
                  <StyledInput
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Auto-filled from receipt, or enter manually"
                  />
                  {customerName && (
                    <p className="text-[11px] text-gray-400 mt-1.5 font-mono">
                      {customerName.trim().replace(/\s+/g, "_")}_
                      {nonOwner ? `${policyType}_NonOwner` : policyType}
                      {noReceipt
                        ? "_NoReceipt"
                        : receiptType === "cash"
                          ? "_Cash"
                          : ""}
                      {paidInFull ? "_PIF" : ""}_{datePreview}_HH-MM.pdf
                    </p>
                  )}
                </div>

                <div>
                  <FieldLabel>Policy type</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {POLICY_TYPES.map((pt) => {
                      const configured =
                        (DOCUMENT_SETS[pt.value] ?? []).length > 0;
                      const selected = policyType === pt.value;
                      return (
                        <button
                          key={pt.value}
                          onClick={() => setPolicyType(pt.value)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${selected ? "bg-blue-600 border-blue-600 text-white" : configured ? "bg-white border-gray-200 text-gray-600 hover:border-blue-300" : "bg-gray-50 border-dashed border-gray-200 text-gray-400"}`}
                        >
                          <span>{pt.emoji}</span>
                          {pt.label ?? pt.value}
                          {!configured && (
                            <span className="text-[10px] opacity-50">
                              (soon)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <FieldLabel>Subtype</FieldLabel>
                  <div className="flex gap-2">
                    {[
                      { v: false, label: "Regular" },
                      { v: true, label: "Non-Owner" },
                    ].map(({ v, label }) => (
                      <button
                        key={String(v)}
                        onClick={() => setNonOwner(v)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${nonOwner === v ? (v ? "bg-violet-600 border-violet-600 text-white" : "bg-blue-600 border-blue-600 text-white") : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <FieldLabel>Payment method on file</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        v: "cc" as PaymentMethod,
                        icon: <CreditCard className="w-4 h-4" />,
                        label: "Credit Card",
                        sub: "Recurring CC Form",
                      },
                      {
                        v: "eft" as PaymentMethod,
                        icon: <Landmark className="w-4 h-4" />,
                        label: "Bank (EFT)",
                        sub: "EFT Form General",
                      },
                      {
                        v: "none" as PaymentMethod,
                        icon: <Ban className="w-4 h-4" />,
                        label: "None",
                        sub: "No payment form",
                      },
                    ].map(({ v, icon, label, sub }) => (
                      <button
                        key={v}
                        onClick={() => setPaymentMethod(v)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${paymentMethod === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
                      >
                        <span
                          className={
                            paymentMethod === v
                              ? "text-blue-600"
                              : "text-gray-400"
                          }
                        >
                          {icon}
                        </span>
                        <div>
                          <p className="text-sm font-semibold leading-none">
                            {label}
                          </p>
                          <p className="text-[11px] mt-0.5 opacity-70">{sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Documents */}
            <SectionCard>
              <SectionTitle>Documents</SectionTitle>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <FieldLabel required>
                      Company application / policy package
                    </FieldLabel>
                    <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                      #2 in merge order
                    </span>
                  </div>

                  {companyApp ? (
                    <div className="space-y-2">
                      <UploadedFile
                        name={companyApp.name}
                        size={companyApp.size}
                        label="Company App"
                        onRemove={() => {
                          setCompanyApp(null);
                          setExtraDocs([]);
                          if (companyAppRef.current)
                            companyAppRef.current.value = "";
                        }}
                      />
                      <button
                        onClick={() => companyAppRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-blue-600 border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add more PDFs to package
                      </button>
                    </div>
                  ) : (
                    <UploadBox onClick={() => companyAppRef.current?.click()}>
                      <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition">
                        <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Upload PDF(s)
                        </p>
                        <p className="text-xs text-gray-400">
                          Upload one or multiple files to include
                        </p>
                      </div>
                    </UploadBox>
                  )}
                  <input
                    ref={companyAppRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0)
                        handleCompanyAppFiles(e.target.files);
                    }}
                  />
                </div>

                {extraDocs.length > 0 && (
                  <div className="space-y-2">
                    <FieldLabel>Extra documents</FieldLabel>
                    {extraDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl"
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={doc.label}
                            onChange={(e) =>
                              handleUpdateExtraLabel(doc.id, e.target.value)
                            }
                            placeholder="Label (optional)"
                            className="w-full text-sm bg-transparent border-none outline-none text-gray-700 font-medium placeholder-gray-400"
                          />
                          <p className="text-xs text-amber-600 truncate">
                            {doc.file.name} ·{" "}
                            {(doc.file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveExtraDoc(doc.id)}
                          className="text-amber-400 hover:text-rose-500 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Receipt & Payment */}
            <SectionCard>
              <div className="flex items-center justify-between mb-4">
                <SectionTitle>Receipt & Payment</SectionTitle>
                <button
                  onClick={() => {
                    setNoReceipt((v) => !v);
                    if (!noReceipt) {
                      handleOfficeReceiptChange(null);
                      setCcReceipts([]);
                      setPaidInFull(false);
                      if (officeReceiptRef.current)
                        officeReceiptRef.current.value = "";
                      if (ccReceiptRef.current) ccReceiptRef.current.value = "";
                    }
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${noReceipt ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                >
                  {noReceipt ? "✓ No Receipt" : "No Receipt"}
                </button>
              </div>

              {noReceipt ? (
                <div className="flex items-center gap-3 px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <Ban className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600">
                      Receipt skipped
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      No office or CC receipt will be included.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Office receipt upload */}
                  <div>
                    <FieldLabel required>Office receipt</FieldLabel>
                    {officeReceipt ? (
                      <div className="space-y-2">
                        <UploadedFile
                          name={officeReceipt.name}
                          size={officeReceipt.size}
                          onRemove={() => {
                            handleOfficeReceiptChange(null);
                            if (officeReceiptRef.current)
                              officeReceiptRef.current.value = "";
                          }}
                        />

                        {/* Extracted receipt info */}
                        {extractingReceipt ? (
                          <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-600">
                            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                            Reading receipt…
                          </div>
                        ) : receiptInfo?.notAReceipt ? (
                          <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-rose-800">
                                Office Copy required
                              </p>
                              <p className="text-xs text-rose-600 mt-1 leading-relaxed">
                                Only the <strong>Office Copy</strong> of the
                                receipt is accepted — not the Customer Copy or
                                any other document.
                              </p>
                              <button
                                onClick={() => {
                                  handleOfficeReceiptChange(null);
                                  if (officeReceiptRef.current)
                                    officeReceiptRef.current.value = "";
                                  setTimeout(
                                    () => officeReceiptRef.current?.click(),
                                    50,
                                  );
                                }}
                                className="mt-2 text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-900 transition"
                              >
                                Upload the correct receipt →
                              </button>
                            </div>
                          </div>
                        ) : receiptInfo ? (
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              From receipt
                            </div>

                            {/* TBD warning */}
                            {isPolicyTbd && (
                              <div className="flex items-start gap-3 p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl">
                                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-semibold text-rose-800">
                                    Policy number is TBD — cannot merge
                                  </p>
                                  <p className="text-xs text-rose-600 mt-0.5">
                                    The receipt shows policy # as TBD. Wait for
                                    the carrier to assign a policy number before
                                    merging.
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                              {(
                                [
                                  ["Customer", receiptInfo.customerName, false],
                                  [
                                    "Policy #",
                                    receiptInfo.policyNumber,
                                    isPolicyTbd,
                                  ],
                                  ["Company", receiptInfo.companyName, false],
                                  [
                                    "Amount",
                                    receiptInfo.paidAmount
                                      ? `$${receiptInfo.paidAmount}`
                                      : null,
                                    false,
                                  ],
                                ] as const
                              ).map(([label, value, isError]) => (
                                <div
                                  key={label}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-[11px] text-gray-400 min-w-[58px]">
                                    {label}
                                  </span>
                                  <span
                                    className={`text-xs font-medium flex-1 truncate ${isError ? "text-rose-600" : "text-gray-700"}`}
                                  >
                                    {value || (
                                      <em className="text-amber-500 font-normal">
                                        not found
                                      </em>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {extractionNote && (
                              <p className="text-[11px] text-emerald-600 mt-2 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                {extractionNote}
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <UploadBox
                        onClick={() => officeReceiptRef.current?.click()}
                      >
                        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition">
                          <Upload className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition" />
                        </div>
                        <p className="text-sm text-gray-400">
                          Upload office receipt PDF
                        </p>
                        <p className="text-xs text-gray-300">
                          Policy #, company, customer name & amount auto-filled
                        </p>
                      </UploadBox>
                    )}
                    <input
                      ref={officeReceiptRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleOfficeReceiptChange(f);
                      }}
                    />
                  </div>

                  {/* Payment details */}
                  <div
                    className={`rounded-2xl border overflow-hidden transition ${officeReceipt ? "border-gray-200" : "border-gray-100 opacity-50"}`}
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr]">
                      <div className="p-5 space-y-4">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                          Payment details
                        </p>
                        <div>
                          <FieldLabel required>Paid amount</FieldLabel>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                              $
                            </span>
                            <StyledInput
                              type="text"
                              inputMode="decimal"
                              value={paidAmount}
                              onChange={(e) =>
                                setPaidAmount(
                                  e.target.value.replace(/[^\d.,]/g, ""),
                                )
                              }
                              disabled={!officeReceipt}
                              placeholder="0.00"
                              className="pl-7"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <FieldLabel required>Next due date</FieldLabel>
                            <StyledInput
                              type="date"
                              value={nextDueDate}
                              onChange={(e) => setNextDueDate(e.target.value)}
                              disabled={!officeReceipt || paidInFull}
                            />
                          </div>
                          <div>
                            <FieldLabel required>Monthly payment</FieldLabel>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                $
                              </span>
                              <StyledInput
                                type="text"
                                inputMode="decimal"
                                value={monthlyAmount}
                                onChange={(e) =>
                                  setMonthlyAmount(
                                    e.target.value.replace(/[^\d.,]/g, ""),
                                  )
                                }
                                disabled={!officeReceipt || paidInFull}
                                placeholder="0.00"
                                className="pl-7"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center py-5">
                        <div className="w-px flex-1 bg-gray-100" />
                        <span className="text-[11px] font-semibold text-gray-300 tracking-widest py-3">
                          OR
                        </span>
                        <div className="w-px flex-1 bg-gray-100" />
                      </div>

                      {/* PIF panel — outer div, NOT a button, so date input never bubbles */}
                      <div
                        className={`flex flex-col justify-start transition ${paidInFull ? "bg-emerald-50" : ""} ${!officeReceipt ? "opacity-40 pointer-events-none" : ""}`}
                      >
                        {/* Clickable toggle row only */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = !paidInFull;
                            setPaidInFull(next);
                            if (!next) {
                              setMonthlyAmount("");
                              setNextDueDate("");
                              setExpirationDate("");
                            } else {
                              setMonthlyAmount("0.00");
                              if (expirationDate) {
                                const computed =
                                  computePifDueDate(expirationDate);
                                if (computed) setNextDueDate(computed);
                              }
                            }
                          }}
                          disabled={!officeReceipt}
                          className={`p-5 pb-3 text-left w-full flex items-start gap-3 disabled:cursor-not-allowed ${paidInFull ? "" : "hover:bg-gray-50"}`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition ${paidInFull ? "border-emerald-500 bg-emerald-500" : "border-gray-300"}`}
                          >
                            {paidInFull && (
                              <svg
                                className="w-2.5 h-2.5"
                                viewBox="0 0 10 8"
                                fill="none"
                              >
                                <path
                                  d="M1 4l3 3 5-6"
                                  stroke="white"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p
                              className={`text-sm font-semibold ${paidInFull ? "text-emerald-800" : "text-gray-700"}`}
                            >
                              Paid in full
                            </p>
                            <p
                              className={`text-xs mt-1 leading-relaxed ${paidInFull ? "text-emerald-600" : "text-gray-400"}`}
                            >
                              {paidInFull
                                ? "Monthly → $0.00. Enter expiration date below."
                                : "Toggle if customer paid the full premium upfront."}
                            </p>
                          </div>
                        </button>

                        {/* Expiration date — outside the toggle button, no bubbling possible */}
                        {paidInFull && (
                          <div className="px-5 pb-5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-semibold">
                              <Calendar className="w-3 h-3" />
                              PIF active
                            </div>
                            <p className="text-[11px] text-emerald-700 font-semibold mb-1">
                              Policy expiration date
                            </p>
                            <input
                              type="date"
                              value={expirationDate}
                              onChange={(e) =>
                                setExpirationDate(e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                            />
                            {nextDueDate && (
                              <p className="text-[11px] text-emerald-600 mt-1">
                                Due date set to{" "}
                                {new Date(
                                  nextDueDate + "T00:00:00",
                                ).toLocaleDateString("en-US", {
                                  month: "numeric",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CC receipt type */}
                  <div>
                    <FieldLabel>Sale receipt type</FieldLabel>
                    <div className="flex gap-2 mb-4">
                      {[
                        {
                          v: "card" as ReceiptType,
                          icon: <CreditCard className="w-4 h-4" />,
                          label: "Card / Square",
                        },
                        {
                          v: "cash" as ReceiptType,
                          icon: <DollarSign className="w-4 h-4" />,
                          label: "Cash / In-Office",
                        },
                      ].map(({ v, icon, label }) => (
                        <button
                          key={v}
                          onClick={() => {
                            setReceiptType(v);
                            if (v === "cash") {
                              setCcReceipts([]);
                              if (ccReceiptRef.current)
                                ccReceiptRef.current.value = "";
                            }
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${receiptType === v ? (v === "card" ? "bg-blue-600 border-blue-600 text-white" : "bg-emerald-600 border-emerald-600 text-white") : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}
                        >
                          {icon}
                          {label}
                        </button>
                      ))}
                    </div>

                    {receiptType === "card" ? (
                      <div className="space-y-2">
                        {ccReceipts.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl"
                          >
                            <CreditCard className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-emerald-800 truncate">
                                {f.name}
                              </p>
                              <p className="text-xs text-emerald-500">
                                {(f.size / 1024).toFixed(0)} KB
                                {ccReceipts.length > 1
                                  ? ` · Card ${i + 1}`
                                  : ""}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                setCcReceipts((prev) =>
                                  prev.filter((_, idx) => idx !== i),
                                )
                              }
                              className="text-emerald-400 hover:text-rose-500 transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <UploadBox
                          onClick={() => ccReceiptRef.current?.click()}
                        >
                          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition">
                            {ccReceipts.length > 0 ? (
                              <PlusCircle className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition" />
                            ) : (
                              <Upload className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-gray-400">
                              {ccReceipts.length > 0
                                ? "Add another card receipt"
                                : "Upload CC receipt"}
                            </p>
                            {ccReceipts.length === 0 && (
                              <p className="text-xs text-gray-300">
                                One receipt per card if split payment
                              </p>
                            )}
                          </div>
                          {ccReceipts.length > 0 && (
                            <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">
                              {ccReceipts.length} added
                            </span>
                          )}
                        </UploadBox>
                        <input
                          ref={ccReceiptRef}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setCcReceipts((prev) => [...prev, f]);
                              if (ccReceiptRef.current)
                                ccReceiptRef.current.value = "";
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">
                            Cash / In-office sale
                          </p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            No CC receipt needed — package ends after office
                            receipt
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Validation hint */}
            {!canMerge && !merging && (
              <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {isPolicyTbd
                  ? "Policy number is TBD — cannot merge until carrier assigns a policy number"
                  : !customerName.trim()
                    ? "Enter customer name to get started"
                    : !companyApp
                      ? "Upload the company application to continue"
                      : noReceipt
                        ? "Ready to merge"
                        : !officeReceipt
                          ? "Upload the Office Copy of the receipt, or toggle No Receipt"
                          : !receiptFieldsReady
                            ? "Fill in paid amount, next due date, and monthly payment"
                            : "Upload a CC receipt or switch to Cash"}
              </div>
            )}
          </div>

          {/* Right column: Merge order */}
          <div className="xl:sticky xl:top-20 xl:self-start space-y-5">
            <SectionCard>
              <SectionTitle>Merge order preview</SectionTitle>
              <div className="space-y-1.5">
                {displayDocs.map((item) => (
                  <div
                    key={`${item.num}-${item.label}`}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {item.num}
                    </span>
                    <span className="text-xs text-gray-600 flex-1 leading-snug">
                      {item.label}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0 ${item.type === "static" ? "bg-emerald-100 text-emerald-700" : item.type === "extra" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}
                    >
                      {item.type === "static"
                        ? "Auto"
                        : item.type === "extra"
                          ? "Extra"
                          : "Upload"}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* TBD block in sidebar */}
            {isPolicyTbd && (
              <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-rose-700">
                  Policy # is TBD — merge blocked until carrier assigns a number
                </p>
              </div>
            )}

            <button
              onClick={handleMerge}
              disabled={!canMerge || merging}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-blue-700 rounded-2xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Merging…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Merge & Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
