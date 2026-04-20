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
};

const POLICY_TYPES = [{ value: "Auto", emoji: "🚗" }];

type PaymentMethod = "none" | "cc" | "eft";
type ReceiptType = "card" | "cash";

interface ExtraDoc {
  id: string;
  file: File;
  label: string;
}

interface ExtractedInfo {
  policyNumber: string | null;
  companyName: string | null;
  insuredName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
}

// ─── STAMP COORDINATES FOR OFFICE RECEIPT ────────────────────────────────────
const OFFICE_RECEIPT_STAMPS = {
  paidAmount: { x: 90, y: 360 },
  dueDate: { x: 198, y: 335 },
  monthlyAmount: { x: 320, y: 338 },
};

export default function PdfMergerPage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
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

  // ── State ─────────────────────────────────────────────────────────────────
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
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [noReceipt, setNoReceipt] = useState(false);
  const [paidInFull, setPaidInFull] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo | null>(
    null,
  );
  const [extractingPolicy, setExtractingPolicy] = useState(false);
  const [extractingTotal, setExtractingTotal] = useState(false);
  const [extractionNote, setExtractionNote] = useState<string | null>(null);

  const companyAppRef = useRef<HTMLInputElement>(null);
  const officeReceiptRef = useRef<HTMLInputElement>(null);
  const ccReceiptRef = useRef<HTMLInputElement>(null);

  const templates = DOCUMENT_SETS[policyType] ?? [];
  const hasTemplates = templates.length > 0;

  const receiptFieldsReady =
    !officeReceipt ||
    (paidAmount.trim() && nextDueDate.trim() && monthlyAmount.trim());

  const canMerge =
    customerName.trim() &&
    companyApp &&
    (noReceipt || (officeReceipt && receiptFieldsReady)) &&
    (noReceipt || receiptType === "cash" || ccReceipts.length > 0);

  // ─── Load pdf.js once, cache result ──────────────────────────────────────
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

  // ─── Auto-extract Total from office receipt ──────────────────────────────
  const extractTotalFromPdf = async (file: File): Promise<string | null> => {
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");

      const dualMatch = text.match(
        /Total\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
      );
      if (dualMatch) return dualMatch[2].replace(/,/g, "");

      const singleMatch = text.match(/Total\s+([\d,]+\.\d{2})/i);
      if (singleMatch) return singleMatch[1].replace(/,/g, "");

      return null;
    } catch (err) {
      console.error("Extract total failed:", err);
      return null;
    }
  };

  // ─── Extract policy info from Company App PDF ───────────────────────────
  const extractPolicyInfoFromPdf = async (
    file: File,
  ): Promise<ExtractedInfo> => {
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Scan first 8 pages — Named Insured label often appears on dec page (p. 5-10)
      let fullText = "";
      const pagesToScan = Math.min(8, pdf.numPages);
      for (let i = 1; i <= pagesToScan; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += " " + content.items.map((item: any) => item.str).join(" ");
      }
      fullText = fullText.replace(/\s+/g, " ").trim();

      // ════════ POLICY NUMBER ════════
      let policyNumber: string | null = null;
      const policyPatterns = [
        /Policy\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-_\/]{5,40})/i,
        /Binder\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-_\/]{5,40})/i,
        /Certificate\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-_\/]{5,40})/i,
      ];
      for (const pattern of policyPatterns) {
        const m = fullText.match(pattern);
        if (m && m[1]) {
          const candidate = m[1].trim();
          if (
            candidate.length >= 6 &&
            /[A-Z0-9]/i.test(candidate) &&
            !/^(of|the|is|no|date|yes|applicant|insured)$/i.test(candidate) &&
            !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(candidate)
          ) {
            policyNumber = candidate;
            break;
          }
        }
      }

      // ════════ COMPANY / CARRIER NAME ════════
      // Strategy: companies always brand the top of page 1 (header/logo area).
      // Extract ONLY from first 600 chars of page 1 to avoid policy numbers,
      // insured names, and body text polluting the match.
      let companyName: string | null = null;

      // Get page 1 text separately for company extraction
      let page1Text = "";
      try {
        const page1 = await pdf.getPage(1);
        const page1Content = await page1.getTextContent();
        page1Text = page1Content.items
          .map((item: any) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 600); // Only top of page — where the header/logo lives
      } catch {
        page1Text = fullText.substring(0, 600);
      }

      const companyPatterns = [
        // "Underwritten by X" — most explicit carrier statement
        /Underwritten\s+by\s+([A-Z][A-Za-z0-9\s,.&'\-]+?(?:Company|Insurance|Agency|LLC|Inc|Corp|Co\.))/,
        // "X Insurance Company" — core pattern, must start with a proper word
        /\b([A-Z][a-z][A-Za-z&'\-]*(?:\s+[A-Z][a-z][A-Za-z&'\-]*){0,2}\s+Insurance\s+Company)\b/,
        // "X General Agency"
        /\b([A-Z][a-z][A-Za-z&'\-]*(?:\s+[A-Z][a-z][A-Za-z&'\-]*){0,2}\s+General\s+Agency(?:,?\s+LLC)?)\b/,
        // "X Risk Insurance Agency"
        /\b([A-Z][a-z][A-Za-z&'\-]*\s+Risk\s+Insurance\s+Agency(?:,?\s+LLC)?)\b/,
        // "X Mutual Fire Insurance Company"
        /\b((?:[A-Z][a-z][A-Za-z]*\s+){1,3}Mutual\s+(?:Fire\s+)?Insurance\s+Company)\b/,
        // "X Specialty Insurance Company"
        /\b([A-Z][a-z][A-Za-z&'\-]*\s+Specialty\s+Insurance(?:\s+Company)?)\b/,
        // "X Insurance" — fallback, fewer suffixes (e.g. "SAFEWAY INSURANCE")
        /\b([A-Z][A-Z&'\-]+(?:\s+[A-Z][A-Z&'\-]+){0,2}\s+INSURANCE)(?:\s|$)/,
      ];

      for (const pattern of companyPatterns) {
        const m = page1Text.match(pattern);
        if (m) {
          let candidate = (m[1] || m[0]).trim().replace(/\s+/g, " ");

          // Reject if candidate contains digits, hyphens surrounded by letters
          // (catches policy-number contamination like "TX-PP-001 Safeway")
          if (/\d|[A-Z]-[A-Z]/.test(candidate)) {
            // Try to strip a leading policy-number-looking prefix
            const strip = candidate.match(/^\S+\s+([A-Z][a-zA-Z].*)/);
            if (strip) {
              candidate = strip[1];
            } else {
              continue; // skip this match entirely
            }
          }

          // Reject agent/producer names
          if (
            /^(Texas\s+Premium|NOORIE|Producer|Agent|Agency\s+Name)/i.test(
              candidate,
            )
          ) {
            continue;
          }

          // Reject if too short or too long
          if (candidate.length < 6 || candidate.length > 80) continue;

          // Normalize "SAFEWAY INSURANCE" → "Safeway Insurance Company"
          // when we know it's a common carrier pattern
          if (
            /^[A-Z\s&'\-]+$/.test(candidate) &&
            !candidate.includes("Company")
          ) {
            candidate =
              candidate.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) +
              " Company";
          }

          companyName = candidate;
          break;
        }
      }

      // ════════ INSURED / APPLICANT NAME ════════
      let insuredName: string | null = null;
      const namePatterns = [
        /(?:Named\s+Insured|Applicant|Insured\s+Name|Legal\s+Name)\s*:?\s+([A-Z]{2,}(?:\s+[A-Z][A-Z\.]{0,}){1,5})(?=\s{2,}|\s+\d|\s+Policy|\s+DOB|\s+Phone|\s+Address|$)/,
        /(?:Named\s+Insured|Applicant|Insured\s+Name|Legal\s+Name)\s*:?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})(?=\s+\d|\s+Policy|\s+DOB|\s{2,}|$)/,
        /Insured\s*:\s+([A-Z][A-Za-z\.\s]{3,60}?)(?=\s{2,}|\s+\d|$)/,
      ];
      for (const pattern of namePatterns) {
        const m = fullText.match(pattern);
        if (m && m[1]) {
          const candidate = m[1].trim().replace(/\s+/g, " ");
          if (
            candidate.split(" ").length >= 2 &&
            candidate.length < 80 &&
            /^[A-Za-z\s\.]+$/.test(candidate) &&
            !/(Company|Insurance|Agency|LLC|Inc|Corp)/i.test(candidate)
          ) {
            insuredName = candidate;
            break;
          }
        }
      }

      // ════════ EFFECTIVE DATE ════════
      let effectiveDate: string | null = null;
      const effPatterns = [
        /(?:Policy\s+)?Effective\s+Date(?:\s+and\s+Time)?\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /Policy\s+Period\s*:?\s*(?:from\s+)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /Inception\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      ];
      for (const pattern of effPatterns) {
        const m = fullText.match(pattern);
        if (m && m[1]) {
          effectiveDate = m[1].trim();
          break;
        }
      }

      // ════════ EXPIRATION DATE ════════
      let expirationDate: string | null = null;
      const expPatterns = [
        /(?:Expiration|Expires?)\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /Policy\s+Period[\s\S]*?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[\s\S]*?to\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /Effective[\s\S]*?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[\s\S]*?to\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(?:from|:)\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[\s\S]*?to\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      ];
      for (const pattern of expPatterns) {
        const m = fullText.match(pattern);
        if (m && m[1]) {
          expirationDate = m[1].trim();
          break;
        }
      }

      return {
        policyNumber,
        companyName,
        insuredName,
        effectiveDate,
        expirationDate,
      };
    } catch (err) {
      console.error("Extract policy info failed:", err);
      return {
        policyNumber: null,
        companyName: null,
        insuredName: null,
        effectiveDate: null,
        expirationDate: null,
      };
    }
  };

  // Given MM/DD/YYYY expiration → return YYYY-MM-DD for (expiration - 1 day)
  const computePifDueDate = (expirationDateStr: string): string | null => {
    try {
      const parts = expirationDateStr.split(/[\/\-]/);
      if (parts.length !== 3) return null;
      const [m, d] = parts;
      let y = parts[2];
      if (y.length === 2) y = `20${y}`;
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (isNaN(date.getTime())) return null;
      date.setDate(date.getDate() - 1);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return iso;
    } catch {
      return null;
    }
  };

  // When PIF is toggled ON, auto-fill due date from expiration and zero monthly
  useEffect(() => {
    if (paidInFull && extractedInfo?.expirationDate) {
      const computed = computePifDueDate(extractedInfo.expirationDate);
      if (computed) setNextDueDate(computed);
      setMonthlyAmount("0.00");
    }
  }, [paidInFull, extractedInfo]);

  const handleOfficeReceiptChange = async (file: File | null) => {
    setOfficeReceipt(file);
    setExtractionNote(null);

    if (!file) {
      setPaidAmount("");
      return;
    }

    setExtractingTotal(true);
    const total = await extractTotalFromPdf(file);
    setExtractingTotal(false);

    if (total) {
      setPaidAmount(total);
      setExtractionNote(`Auto-filled from receipt`);
    } else {
      setExtractionNote(`Could not auto-read total — please enter it manually`);
    }
  };

  // ── Company App: multi-file handler ──────────────────────────────────────
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
      setCompanyApp(arr[0]);
      if (arr.length > 1) {
        const newExtras: ExtraDoc[] = arr.slice(1).map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          label: f.name.replace(/\.pdf$/i, ""),
        }));
        setExtraDocs((prev) => [...prev, ...newExtras]);
      }

      // Extract policy info from the primary company app immediately
      setExtractingPolicy(true);
      const info = await extractPolicyInfoFromPdf(arr[0]);
      setExtractedInfo(info);
      setExtractingPolicy(false);
      console.log("📄 Extracted policy info:", info);
    }

    if (companyAppRef.current) companyAppRef.current.value = "";
  };

  const handleRemoveExtraDoc = (id: string) => {
    setExtraDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleUpdateExtraLabel = (id: string, label: string) => {
    setExtraDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, label } : d)),
    );
  };

  const paymentFormLabel =
    paymentMethod === "cc"
      ? "Recurring CC Authorization"
      : paymentMethod === "eft"
        ? "EFT Authorization (Bank on File)"
        : null;

  const baseCount = hasTemplates ? templates.length : 0;
  const afterCompany = extraDocs.length;
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
    ...(paymentFormLabel
      ? [
          {
            num: baseCount + afterCompany + 2,
            label: paymentFormLabel,
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
            page.drawText(`$${paidAmount.trim()}`, {
              x: OFFICE_RECEIPT_STAMPS.paidAmount.x,
              y: OFFICE_RECEIPT_STAMPS.paidAmount.y,
              size: 10,
              font,
              color: rgb(0, 0, 0),
            });
            const [y, m, d] = nextDueDate.split("-");
            const formattedDate = `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
            page.drawText(formattedDate, {
              x: OFFICE_RECEIPT_STAMPS.dueDate.x,
              y: OFFICE_RECEIPT_STAMPS.dueDate.y,
              size: 10,
              font,
              color: rgb(0, 0, 0),
            });
            page.drawText(`$${monthlyAmount.trim()}`, {
              x: OFFICE_RECEIPT_STAMPS.monthlyAmount.x,
              y: OFFICE_RECEIPT_STAMPS.monthlyAmount.y,
              size: 10,
              font,
              color: rgb(0, 0, 0),
            });
          }
        });
      };

      const fetchTemplate = async (key: string): Promise<Uint8Array> => {
        const res = await fetch(`/templates/${encodeURIComponent(key)}.pdf`);
        if (!res.ok)
          throw new Error(
            `Could not load template: ${key}.pdf — make sure it exists in /public/templates/`,
          );
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
        for (const t of templates.slice(1)) {
          await addPdf(await fetchTemplate(t.key), t.key);
        }
        if (paymentMethod === "cc") {
          await addPdf(
            await fetchTemplate("Recurring CC form"),
            "Recurring CC form",
          );
        } else if (paymentMethod === "eft") {
          await addPdf(
            await fetchTemplate("EFT form general"),
            "EFT form general",
          );
        }
        if (nonOwner) {
          await addPdf(
            await fetchTemplate("Non owner policy consent form"),
            "Non owner policy consent form",
          );
        }
      }

      if (!noReceipt) {
        await addOfficeReceipt(await readFile(officeReceipt!));
        if (receiptType === "card") {
          for (const receipt of ccReceipts) {
            await addPdf(await readFile(receipt));
          }
        }
      }

      const datePart = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}-${today.getFullYear()}`;
      const timePart = `${pad(today.getHours())}-${pad(today.getMinutes())}`;
      const safeName = customerName.trim().replace(/\s+/g, "_");
      const policyLabel = nonOwner ? `${policyType}_NonOwner` : policyType;
      const receiptLabel = noReceipt
        ? "_NoReceipt"
        : receiptType === "cash"
          ? "_Cash"
          : "";
      const pifLabel = paidInFull ? "_PIF" : "";
      const filename = `${safeName}_${policyLabel}${receiptLabel}${pifLabel}_${datePart}_${timePart}.pdf`;

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

      // Save to MongoDB — uses already-extracted info
      try {
        await fetch("/api/save-merger-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: customerName.trim(),
            policyNumber: extractedInfo?.policyNumber || null,
            companyName: extractedInfo?.companyName || null,
            insuredNameFromPdf: extractedInfo?.insuredName || null,
            effectiveDate: extractedInfo?.effectiveDate || null,
            expirationDate: extractedInfo?.expirationDate || null,
            paidAmount: paidAmount.trim() || null,
            nextDueDate: nextDueDate || null,
            monthlyAmount: monthlyAmount.trim() || null,
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
        console.warn("Failed to save merger info to MongoDB:", saveErr);
      }

      setStatus({ type: "success", message: `Downloaded: ${filename}` });
    } catch (err) {
      console.error(err);
      setStatus({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Merge failed. Check console for details.",
      });
    } finally {
      setMerging(false);
    }
  };

  const handleReset = () => {
    setCustomerName("");
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
    setExtractedInfo(null);
    if (companyAppRef.current) companyAppRef.current.value = "";
    if (officeReceiptRef.current) officeReceiptRef.current.value = "";
    if (ccReceiptRef.current) ccReceiptRef.current.value = "";
  };

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePreview = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Checking authentication…</p>
        </div>
      </div>
    );
  }

  const receiptFieldsEnabled = !!officeReceipt;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <button
                onClick={() => (window.location.href = "/admin")}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1 transition-colors"
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
              <h1 className="text-2xl font-bold text-gray-900">
                Policy PDF Merger
              </h1>
              <p className="text-gray-500 text-sm">
                Merge and download the complete policy document package
              </p>
            </div>
          </div>
        </div>

        {/* Policy Type + Options */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
              Policy Type
            </h2>
            <div className="flex flex-wrap gap-2">
              {POLICY_TYPES.map((pt) => {
                const configured = (DOCUMENT_SETS[pt.value] ?? []).length > 0;
                const selected = policyType === pt.value;
                return (
                  <button
                    key={pt.value}
                    onClick={() => setPolicyType(pt.value)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border-2 transition ${
                      selected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : configured
                          ? "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                          : "border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    <span>{pt.emoji}</span>
                    <span>{pt.value}</span>
                    {!configured && (
                      <span className="text-[10px] opacity-60">(soon)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Non-Owner Toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Policy Subtype
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {nonOwner
                  ? "Non-Owner — consent form will be added before receipts"
                  : "Regular policy"}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setNonOwner(false)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                  !nonOwner
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Regular
              </button>
              <button
                onClick={() => setNonOwner(true)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                  nonOwner
                    ? "bg-purple-600 text-white shadow"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Non-Owner
              </button>
            </div>
          </div>

          {/* Payment Method */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-1">
              Payment Method on File
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Choose which recurring payment form to include
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentMethod("cc")}
                className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  paymentMethod === "cc"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-blue-300"
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span>Credit Card</span>
                <span className="text-[10px] font-normal opacity-70">
                  Recurring CC Form
                </span>
              </button>
              <button
                onClick={() => setPaymentMethod("eft")}
                className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  paymentMethod === "eft"
                    ? "border-green-600 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-green-300"
                }`}
              >
                <Landmark className="w-5 h-5" />
                <span>Bank (EFT)</span>
                <span className="text-[10px] font-normal opacity-70">
                  EFT Form General
                </span>
              </button>
              <button
                onClick={() => setPaymentMethod("none")}
                className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  paymentMethod === "none"
                    ? "border-gray-500 bg-gray-100 text-gray-700"
                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-400"
                }`}
              >
                <Ban className="w-5 h-5" />
                <span>None</span>
                <span className="text-[10px] font-normal opacity-70">
                  No payment form
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Document Order Preview */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
            Final Document Order
          </h2>
          <div className="space-y-2">
            {displayDocs.map((item) => (
              <div
                key={`${item.num}-${item.label}`}
                className="flex items-center gap-3"
              >
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {item.num}
                </span>
                <span className="text-sm text-gray-700 flex-1">
                  {item.label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.type === "static"
                      ? "bg-green-100 text-green-700"
                      : item.type === "extra"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
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
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 space-y-5">
          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {customerName && (
              <p className="text-xs text-gray-500 mt-1">
                Filename preview:{" "}
                <span className="font-mono text-gray-700">
                  {customerName.trim().replace(/\s+/g, "_")}_
                  {nonOwner ? `${policyType}_NonOwner` : policyType}
                  {noReceipt
                    ? "_NoReceipt"
                    : receiptType === "cash"
                      ? "_Cash"
                      : ""}
                  {paidInFull ? "_PIF" : ""}_{datePreview}_HH-MM.pdf
                </span>
              </p>
            )}
          </div>

          {/* Company Application */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">
                2
              </span>
              Company Application / Policy Package{" "}
              <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2 ml-7">
              Select one or more PDFs — first file is the company app, any
              additional files are added as extras automatically
            </p>

            {companyApp ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                  <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">
                      {companyApp.name}
                    </p>
                    <p className="text-xs text-green-600">
                      {(companyApp.size / 1024).toFixed(0)} KB · Company App
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCompanyApp(null);
                      setExtractedInfo(null);
                      if (companyAppRef.current)
                        companyAppRef.current.value = "";
                    }}
                    className="text-green-600 hover:text-red-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Extracted info preview */}
                {(extractingPolicy || extractedInfo) && (
                  <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg text-xs">
                    {extractingPolicy ? (
                      <p className="text-blue-700 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Reading policy document...
                      </p>
                    ) : extractedInfo ? (
                      <div className="space-y-0.5 text-gray-700">
                        <p className="font-semibold text-blue-900 mb-1">
                          <Sparkles className="w-3 h-3 inline mr-1" />
                          Extracted from PDF:
                        </p>
                        <p>
                          <span className="text-gray-500">Insured:</span>{" "}
                          {extractedInfo.insuredName || (
                            <em className="text-amber-600">not found</em>
                          )}
                        </p>
                        <p>
                          <span className="text-gray-500">Policy #:</span>{" "}
                          {extractedInfo.policyNumber || (
                            <em className="text-amber-600">not found</em>
                          )}
                        </p>
                        <p>
                          <span className="text-gray-500">Company:</span>{" "}
                          {extractedInfo.companyName || (
                            <em className="text-amber-600">not found</em>
                          )}
                        </p>
                        <p>
                          <span className="text-gray-500">Effective:</span>{" "}
                          {extractedInfo.effectiveDate || (
                            <em className="text-amber-600">not found</em>
                          )}{" "}
                          <span className="text-gray-400">→</span>{" "}
                          <span className="text-gray-500">Expires:</span>{" "}
                          {extractedInfo.expirationDate || (
                            <em className="text-amber-600">not found</em>
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}

                <button
                  onClick={() => companyAppRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-dashed border-blue-300 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition text-sm font-medium w-full justify-center"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add more PDFs to this package
                </button>
              </div>
            ) : (
              <button
                onClick={() => companyAppRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left"
              >
                <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div>
                  <span className="text-sm text-gray-500 block">
                    Click to upload PDF(s)
                  </span>
                  <span className="text-xs text-gray-400">
                    You can select multiple files at once
                  </span>
                </div>
              </button>
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

          {/* Extra Documents */}
          {extraDocs.length > 0 && (
            <div>
              {extraDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-200 text-yellow-800 text-xs font-bold flex-shrink-0 mt-2">
                    +
                  </span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={doc.label}
                      onChange={(e) =>
                        handleUpdateExtraLabel(doc.id, e.target.value)
                      }
                      placeholder="Document label (optional)"
                      className="w-full text-sm px-3 py-1.5 border border-yellow-300 rounded-md focus:ring-2 focus:ring-yellow-400 outline-none bg-white mb-1"
                    />
                    <p className="text-xs text-yellow-700 truncate flex items-center gap-1">
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      {doc.file.name} · {(doc.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveExtraDoc(doc.id)}
                    className="text-yellow-600 hover:text-red-600 transition mt-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Office Receipt Section ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">
                  10
                </span>
                Office Receipt{" "}
                {!noReceipt && <span className="text-red-500">*</span>}
              </label>
              <button
                type="button"
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
                className={`text-xs px-3 py-1 rounded-full font-semibold border transition ${
                  noReceipt
                    ? "bg-gray-700 text-white border-gray-700"
                    : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                }`}
              >
                {noReceipt ? "✓ No Receipt" : "No Receipt"}
              </button>
            </div>

            {!noReceipt && (
              <>
                <p className="text-xs text-gray-500 mb-2 ml-7">
                  The agency office receipt PDF from your system
                </p>

                {officeReceipt ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 truncate">
                        {officeReceipt.name}
                      </p>
                      <p className="text-xs text-green-600">
                        {(officeReceipt.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleOfficeReceiptChange(null);
                        if (officeReceiptRef.current)
                          officeReceiptRef.current.value = "";
                      }}
                      className="text-green-600 hover:text-red-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => officeReceiptRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left"
                  >
                    <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-500">
                      Click to upload PDF
                    </span>
                  </button>
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

                {/* Receipt stamp fields */}
                <div
                  className={`rounded-xl border p-4 transition mt-4 ${
                    receiptFieldsEnabled
                      ? "border-blue-200 bg-blue-50/30"
                      : "border-gray-200 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign
                      className={`w-4 h-4 ${receiptFieldsEnabled ? "text-blue-600" : "text-gray-400"}`}
                    />
                    <p
                      className={`text-sm font-semibold ${receiptFieldsEnabled ? "text-blue-900" : "text-gray-500"}`}
                    >
                      Receipt Details
                    </p>
                    {!receiptFieldsEnabled && (
                      <span className="text-[10px] text-gray-400 italic">
                        (upload an office receipt to enable)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* PIF toggle */}
                    {/* PIF toggle — entire card is clickable */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !paidInFull;
                        setPaidInFull(next);
                        if (!next) {
                          setMonthlyAmount("");
                        }
                      }}
                      disabled={!receiptFieldsEnabled}
                      className={`w-full flex items-center justify-between p-3 border rounded-lg text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        paidInFull
                          ? "bg-emerald-50 border-emerald-300 hover:bg-emerald-100"
                          : "bg-white border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex-1">
                        <p
                          className={`text-xs font-semibold uppercase tracking-wider ${
                            paidInFull ? "text-emerald-800" : "text-gray-700"
                          }`}
                        >
                          Paid in Full
                        </p>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            paidInFull ? "text-emerald-700" : "text-gray-500"
                          }`}
                        >
                          {paidInFull
                            ? extractedInfo?.expirationDate
                              ? `Due date auto-set to day before expiration (${extractedInfo.expirationDate})`
                              : "No expiration date found — enter due date manually"
                            : "Toggle on if customer paid the full policy premium"}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-3 py-1.5 rounded-full font-semibold border flex-shrink-0 ml-3 ${
                          paidInFull
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-gray-500 border-gray-300"
                        }`}
                      >
                        {paidInFull ? "✓ PIF" : "PIF"}
                      </span>
                    </button>

                    {/* Paid Amount */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Paid Amount <span className="text-red-500">*</span>
                        {extractingTotal && (
                          <span className="ml-2 text-[10px] text-blue-600 font-normal normal-case">
                            <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                            Reading receipt…
                          </span>
                        )}
                        {extractionNote && !extractingTotal && (
                          <span
                            className={`ml-2 text-[10px] font-normal normal-case ${paidAmount ? "text-green-600" : "text-amber-600"}`}
                          >
                            {paidAmount && (
                              <Sparkles className="w-3 h-3 inline mr-1" />
                            )}
                            {extractionNote}
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={paidAmount}
                          onChange={(e) =>
                            setPaidAmount(
                              e.target.value.replace(/[^\d.,]/g, ""),
                            )
                          }
                          disabled={!receiptFieldsEnabled}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Total from the receipt — stamped next to &quot;Paid
                        $&quot;
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          Next Due Date <span className="text-red-500">*</span>
                          {paidInFull && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-normal normal-case">
                              Auto (PIF)
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={nextDueDate}
                          onChange={(e) => setNextDueDate(e.target.value)}
                          disabled={!receiptFieldsEnabled || paidInFull}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                          <DollarSign className="w-3 h-3 inline mr-1" />
                          Monthly Payment{" "}
                          <span className="text-red-500">*</span>
                          {paidInFull && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-normal normal-case">
                              N/A (PIF)
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            $
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={monthlyAmount}
                            onChange={(e) =>
                              setMonthlyAmount(
                                e.target.value.replace(/[^\d.,]/g, ""),
                              )
                            }
                            disabled={!receiptFieldsEnabled || paidInFull}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sale Receipt Type Toggle + CC Receipts */}
                <div className="pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Sale Receipt Type
                  </p>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 mb-4 w-fit">
                    <button
                      onClick={() => setReceiptType("card")}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                        receiptType === "card"
                          ? "bg-blue-600 text-white shadow"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Card / Square
                    </button>
                    <button
                      onClick={() => {
                        setReceiptType("cash");
                        setCcReceipts([]);
                        if (ccReceiptRef.current)
                          ccReceiptRef.current.value = "";
                      }}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                        receiptType === "cash"
                          ? "bg-emerald-600 text-white shadow"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      💵 Cash / In-Office
                    </button>
                  </div>

                  {receiptType === "card" ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">
                          11
                        </span>
                        Credit Card Receipt(s){" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 mb-3 ml-7">
                        Add one receipt per card — multiple cards supported
                      </p>

                      {ccReceipts.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg mb-2"
                        >
                          <CreditCard className="w-5 h-5 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-800 truncate">
                              {f.name}
                            </p>
                            <p className="text-xs text-green-600 flex items-center gap-2">
                              {(f.size / 1024).toFixed(0)} KB
                              {ccReceipts.length > 1 && (
                                <span className="px-1.5 py-0.5 bg-green-200 text-green-800 rounded text-[10px] font-semibold">
                                  Card {i + 1}
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setCcReceipts((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                            className="text-green-600 hover:text-red-600 transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() => ccReceiptRef.current?.click()}
                        className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left"
                      >
                        <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="text-sm text-gray-500 block">
                            {ccReceipts.length > 0
                              ? "Add another card receipt"
                              : "Click to upload CC receipt"}
                          </span>
                          {ccReceipts.length === 0 && (
                            <span className="text-xs text-gray-400">
                              Upload one receipt per card if split payment
                            </span>
                          )}
                        </div>
                        {ccReceipts.length > 0 && (
                          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                            {ccReceipts.length} added
                          </span>
                        )}
                      </button>

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
                    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-emerald-600 text-lg">💵</span>
                      <div>
                        <p className="text-sm font-medium text-emerald-800">
                          Cash / In-Office Sale
                        </p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          No CC receipt needed — package will end after the
                          office receipt
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {noReceipt && (
              <div className="mt-2 flex items-center gap-3 px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg">
                <span className="text-gray-500 text-lg">🚫</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    No Receipt — skipped
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    The PDF package will not include an office receipt or CC
                    receipt.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {status && (
          <div
            className={`rounded-xl p-4 mb-6 flex items-center gap-3 ${
              status.type === "success"
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <p
              className={`text-sm font-medium ${status.type === "success" ? "text-green-800" : "text-red-800"}`}
            >
              {status.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            Reset
          </button>
          <button
            onClick={handleMerge}
            disabled={!canMerge || merging}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-red-700 to-blue-800 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {merging ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Merging…
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Merge & Download PDF
              </>
            )}
          </button>
        </div>

        {!canMerge && !merging && (
          <p className="text-center text-xs text-gray-400 mt-3">
            {!customerName.trim()
              ? "Enter customer name to get started"
              : !companyApp
                ? "Upload the company application to continue"
                : noReceipt
                  ? "Ready to merge — no receipt needed"
                  : !officeReceipt
                    ? "Upload the office receipt or toggle No Receipt"
                    : !receiptFieldsReady
                      ? "Enter paid amount, next due date, and monthly payment"
                      : "Upload a CC receipt or switch to Cash"}
          </p>
        )}
      </div>
    </div>
  );
}
