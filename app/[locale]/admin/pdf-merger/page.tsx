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

type ExtractionField =
  | "policyNumber"
  | "companyName"
  | "insuredName"
  | "effectiveDate"
  | "expirationDate";

interface ExtractedInfo {
  policyNumber: string | null;
  companyName: string | null;
  insuredName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  fieldSources: Record<string, "rule" | "regex" | "ai" | "none">;
  carrierFingerprint: string | null;
  carrierLabel: string | null;
  rawChunks: string[];
}

interface SavedRule {
  field: ExtractionField;
  matchedChunk: string;
  extractedValue: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: string;
  version: number;
  // NEW: static rules (e.g. logo-identified company name) have isStatic=true
  // and are matched purely by carrier fingerprint — no chunk needed.
  isStatic?: boolean;
}

interface SavedCarrierRules {
  carrierFingerprint: string;
  carrierLabel: string;
  rules: SavedRule[];
}

type CorrectionMap = Record<
  ExtractionField,
  { value: string; matchedChunk: string } | null
>;

// ─── STAMP COORDINATES FOR OFFICE RECEIPT ────────────────────────────────────
const OFFICE_RECEIPT_STAMPS = {
  paidAmount: { x: 90, y: 360 },
  dueDate: { x: 198, y: 335 },
  monthlyAmount: { x: 320, y: 338 },
};

// ─── Field validators — reject clicks that don't match expected shape ──
const FIELD_VALIDATORS: Record<
  ExtractionField,
  { test: (s: string) => boolean; hint: string }
> = {
  insuredName: {
    test: (s) => {
      const clean = s.trim();
      return (
        /^[A-Za-z][A-Za-z\s\.'\-]{2,60}$/.test(clean) &&
        clean.split(/\s+/).length >= 2 &&
        !/\d/.test(clean) &&
        !/(Company|Insurance|Agency|LLC|Inc|Corp)/i.test(clean)
      );
    },
    hint: "Names should be 2+ words with letters only (e.g. 'John Smith')",
  },
  companyName: {
    test: (s) => {
      const clean = s.trim();
      return (
        clean.length >= 5 &&
        clean.length <= 80 &&
        /(Insurance|Company|Agency|Mutual|Specialty|Risk|LLC|Inc|Corp)/i.test(
          clean,
        ) &&
        !/^\d/.test(clean) &&
        !/[A-Z]-[A-Z]/.test(clean)
      );
    },
    hint: "Company names usually contain 'Insurance', 'Company', 'Agency', etc.",
  },
  policyNumber: {
    test: (s) => {
      const clean = s.trim();
      return (
        /^[A-Z0-9][A-Z0-9\-_\/]{5,39}$/i.test(clean) &&
        !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(clean)
      );
    },
    hint: "Policy numbers are 6+ chars, letters and numbers (e.g. '4368264-TX-PP-001')",
  },
  effectiveDate: {
    test: (s) => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s.trim()),
    hint: "Look for a date like 'MM/DD/YYYY' (e.g. '04/17/2026')",
  },
  expirationDate: {
    test: (s) => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s.trim()),
    hint: "Look for a date like 'MM/DD/YYYY' (e.g. '10/17/2026')",
  },
};

// ─── Merge adjacent text items into clickable regions ────────────────
const mergeAdjacentTextItems = (
  items: any[],
  scale: number,
  viewportHeight: number,
): Array<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> => {
  const regions: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    topY: number;
  }> = [];

  for (const item of items) {
    if (!item.str || item.str.trim().length === 0) continue;
    const tx = item.transform;
    const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    const x = tx[4] * scale;
    const topY = viewportHeight - tx[5] * scale - fontSize * scale;
    const width = item.width * scale;
    const height = fontSize * scale * 1.2;

    const last = regions[regions.length - 1];
    if (
      last &&
      Math.abs(last.topY - topY) < height * 0.5 &&
      x - (last.x + last.width) < fontSize * scale * 2
    ) {
      const mergedRight = x + width;
      last.text = (last.text + " " + item.str).replace(/\s+/g, " ").trim();
      last.width = mergedRight - last.x;
      continue;
    }

    regions.push({
      text: item.str.trim(),
      x,
      y: topY,
      topY,
      width,
      height,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return regions.map(({ topY, ...rest }) => rest);
};

// ─── Fingerprint: canonicalize the top of page 1 into a stable key ───────
const computeCarrierFingerprint = (
  page1Text: string,
): { fingerprint: string; label: string } => {
  const head = page1Text.substring(0, 300);
  let label = "Unknown carrier";
  const labelMatch =
    head.match(
      /([A-Z][A-Za-z][A-Za-z&'\-]*(?:\s+[A-Z][A-Za-z&'\-]*){0,3}\s+(?:Insurance|Mutual|Specialty|Risk)(?:\s+Company|\s+Agency)?)/,
    ) || head.match(/([A-Z][A-Z&\s]{4,30}\s+INSURANCE)/);
  if (labelMatch) {
    label = labelMatch[1]
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (!/Company|Agency|Mutual/i.test(label)) label = label + " Company";
  }

  const fingerprint = page1Text
    .substring(0, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 80);

  return { fingerprint, label };
};

// ─── Apply a saved rule to current PDF text ──────────────────────────────
// NEW: Static rules (isStatic=true) bypass all text matching and return
// their stored value immediately — used for logo-identified company names
// and any other field where the value doesn't appear in extracted text.
const applyRule = (fullText: string, rule: SavedRule): string | null => {
  // Static rules: matched purely by fingerprint — always return the stored value
  if (rule.isStatic) {
    console.log(
      `  ✓ Static rule hit for ${rule.field}: ${rule.extractedValue}`,
    );
    return rule.extractedValue;
  }

  if (rule.matchedChunk && fullText.includes(rule.matchedChunk)) {
    return rule.extractedValue;
  }

  if (rule.contextBefore && rule.contextAfter) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      const pattern = new RegExp(
        esc(rule.contextBefore) +
          "\\s*([^\\s].{0,80}?)\\s*" +
          esc(rule.contextAfter),
        "i",
      );
      const m = fullText.match(pattern);
      if (m && m[1]) {
        const candidate = m[1].trim();
        if (
          Math.abs(candidate.length - rule.extractedValue.length) <=
          Math.max(5, rule.extractedValue.length * 0.5)
        ) {
          return candidate;
        }
      }
    } catch {
      // regex failed, ignore
    }
  }

  if (rule.contextBefore && fullText.includes(rule.contextBefore)) {
    const idx = fullText.indexOf(rule.contextBefore);
    const window = fullText.substring(
      idx + rule.contextBefore.length,
      idx + rule.contextBefore.length + 100,
    );
    const shape = rule.extractedValue
      .replace(/[A-Z]/g, "[A-Z]")
      .replace(/[a-z]/g, "[a-z]")
      .replace(/\d/g, "\\d")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      const m = window.match(new RegExp(shape));
      if (m) return m[0];
    } catch {
      // ignore
    }
  }

  return null;
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
  const [aiExtracting, setAiExtracting] = useState(false);
  const [extractingTotal, setExtractingTotal] = useState(false);
  const [extractionNote, setExtractionNote] = useState<string | null>(null);

  // Correction UI state
  const [corrections, setCorrections] = useState<CorrectionMap>({
    policyNumber: null,
    companyName: null,
    insuredName: null,
    effectiveDate: null,
    expirationDate: null,
  });
  const [savingCorrections, setSavingCorrections] = useState(false);

  // PDF-click modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [modalPageNum, setModalPageNum] = useState(1);
  const [modalTotalPages, setModalTotalPages] = useState(1);
  const [modalPdfDoc, setModalPdfDoc] = useState<any>(null);
  const [currentMissingField, setCurrentMissingField] =
    useState<ExtractionField | null>(null);
  const [missingFieldsQueue, setMissingFieldsQueue] = useState<
    ExtractionField[]
  >([]);
  const [lastClickedBox, setLastClickedBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [pendingClick, setPendingClick] = useState<{
    field: ExtractionField;
    value: string;
    box: { x: number; y: number; width: number; height: number };
    isInvalid: boolean;
  } | null>(null);

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfOverlayRef = useRef<HTMLDivElement>(null);
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

  // ─── Save a single extraction rule to the API ────────────────────────────
  // Centralised helper so both the main extractor and the correction modal
  // use the exact same logic.  Pass isStatic=true for logo / fingerprint-only
  // rules where there is no matching text chunk in the PDF.
  const saveExtractionRule = async ({
    carrierFingerprint,
    carrierLabel,
    field,
    matchedChunk,
    extractedValue,
    contextBefore,
    contextAfter,
    isStatic,
  }: {
    carrierFingerprint: string;
    carrierLabel: string | null;
    field: ExtractionField;
    matchedChunk: string;
    extractedValue: string;
    contextBefore: string;
    contextAfter: string;
    isStatic?: boolean;
  }): Promise<boolean> => {
    try {
      const res = await fetch("/api/extraction-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierFingerprint,
          carrierLabel,
          field,
          matchedChunk,
          extractedValue,
          contextBefore,
          contextAfter,
          isStatic: isStatic ?? false,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  // ─── Extract policy info from Company App PDF ───────────────────────────
  const extractPolicyInfoFromPdf = async (
    file: File,
  ): Promise<ExtractedInfo> => {
    const fieldSources: Record<string, "rule" | "regex" | "ai" | "none"> = {
      policyNumber: "none",
      companyName: "none",
      insuredName: "none",
      effectiveDate: "none",
      expirationDate: "none",
    };

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      let page1Text = "";
      const pagesToScan = Math.min(8, pdf.numPages);
      for (let i = 1; i <= pagesToScan; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(" ");
        fullText += " " + pageText;
        if (i === 1) page1Text = pageText.replace(/\s+/g, " ").trim();
      }
      fullText = fullText.replace(/\s+/g, " ").trim();

      const { fingerprint, label } = computeCarrierFingerprint(page1Text);

      // ── Load saved rules for this carrier fingerprint ─────────────────
      let savedRules: SavedCarrierRules | null = null;
      try {
        const res = await fetch(
          `/api/extraction-rules?fingerprint=${encodeURIComponent(fingerprint)}`,
        );
        const data = await res.json();
        if (data.success && data.rules) {
          savedRules = data.rules as SavedCarrierRules;
          console.log(
            `📚 Loaded ${savedRules.rules.length} saved rule(s) for ${savedRules.carrierLabel}`,
          );
        } else {
          console.log(`📚 No saved rules for fingerprint: ${fingerprint}`);
        }
      } catch (err) {
        console.warn("Could not load extraction rules:", err);
      }

      const tryRulesFor = (field: ExtractionField): string | null => {
        if (!savedRules) return null;
        const fieldRules = savedRules.rules
          .filter((r) => r.field === field)
          // Static rules first, then by version descending
          .sort((a, b) => {
            if (a.isStatic && !b.isStatic) return -1;
            if (!a.isStatic && b.isStatic) return 1;
            return b.version - a.version;
          });
        for (const rule of fieldRules) {
          const result = applyRule(fullText, rule);
          if (result) {
            console.log(
              `  ✓ Rule v${rule.version}${rule.isStatic ? " [static]" : ""} hit for ${field}: ${result}`,
            );
            return result;
          }
        }
        return null;
      };

      // ── POLICY NUMBER ──────────────────────────────────────────────────
      let policyNumber: string | null = tryRulesFor("policyNumber");
      if (policyNumber) fieldSources.policyNumber = "rule";
      else {
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
              fieldSources.policyNumber = "regex";
              break;
            }
          }
        }
      }

      // ── COMPANY / CARRIER NAME ─────────────────────────────────────────
      let companyName: string | null = tryRulesFor("companyName");
      if (companyName) fieldSources.companyName = "rule";
      else {
        const headText = page1Text.substring(0, 600);
        const companyPatterns = [
          /Underwritten\s+by\s+([A-Z][A-Za-z0-9\s,.&'\-]+?(?:Company|Insurance|Agency|LLC|Inc|Corp|Co\.))/,
          /\b([A-Z][a-z][A-Za-z&'\-]*(?:\s+[A-Z][a-z][A-Za-z&'\-]*){0,2}\s+Insurance\s+Company)\b/,
          /\b([A-Z][a-z][A-Za-z&'\-]*(?:\s+[A-Z][a-z][A-Za-z&'\-]*){0,2}\s+General\s+Agency(?:,?\s+LLC)?)\b/,
          /\b([A-Z][a-z][A-Za-z&'\-]*\s+Risk\s+Insurance\s+Agency(?:,?\s+LLC)?)\b/,
          /\b((?:[A-Z][a-z][A-Za-z]*\s+){1,3}Mutual\s+(?:Fire\s+)?Insurance\s+Company)\b/,
          /\b([A-Z][a-z][A-Za-z&'\-]*\s+Specialty\s+Insurance(?:\s+Company)?)\b/,
          /\b([A-Z][A-Z&'\-]+(?:\s+[A-Z][A-Z&'\-]+){0,2}\s+INSURANCE)(?:\s|$)/,
        ];
        for (const pattern of companyPatterns) {
          const m = headText.match(pattern);
          if (m) {
            let candidate = (m[1] || m[0]).trim().replace(/\s+/g, " ");
            if (/\d|[A-Z]-[A-Z]/.test(candidate)) {
              const strip = candidate.match(/^\S+\s+([A-Z][a-zA-Z].*)/);
              if (strip) {
                candidate = strip[1];
              } else {
                continue;
              }
            }
            if (
              /^(Texas\s+Premium|NOORIE|Producer|Agent|Agency\s+Name)/i.test(
                candidate,
              )
            )
              continue;
            if (candidate.length < 6 || candidate.length > 80) continue;
            if (
              /^[A-Z\s&'\-]+$/.test(candidate) &&
              !candidate.includes("Company")
            ) {
              candidate =
                candidate
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase()) + " Company";
            }
            companyName = candidate;
            fieldSources.companyName = "regex";
            break;
          }
        }
      }

      // ── INSURED / APPLICANT NAME ───────────────────────────────────────
      let insuredName: string | null = tryRulesFor("insuredName");
      if (insuredName) fieldSources.insuredName = "rule";
      else {
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
              fieldSources.insuredName = "regex";
              break;
            }
          }
        }
      }

      // ── EFFECTIVE DATE ─────────────────────────────────────────────────
      let effectiveDate: string | null = tryRulesFor("effectiveDate");
      if (effectiveDate) fieldSources.effectiveDate = "rule";
      else {
        const effPatterns = [
          /(?:Policy\s+)?Effective\s+Date(?:\s+and\s+Time)?\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
          /Policy\s+Period\s*:?\s*(?:from\s+)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
          /Inception\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        ];
        for (const pattern of effPatterns) {
          const m = fullText.match(pattern);
          if (m && m[1]) {
            effectiveDate = m[1].trim();
            fieldSources.effectiveDate = "regex";
            break;
          }
        }
      }

      // ── EXPIRATION DATE ────────────────────────────────────────────────
      let expirationDate: string | null = tryRulesFor("expirationDate");
      if (expirationDate) fieldSources.expirationDate = "rule";
      else {
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
            fieldSources.expirationDate = "regex";
            break;
          }
        }
      }

      // Split text into clickable chunks (used for context when saving rules)
      const rawChunks = fullText
        .split(/(?:\s{2,}|(?<=[.:])\s+|\s+(?=[A-Z][A-Za-z]+\s*:))/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && s.length <= 100);

      // ════════ AI FALLBACK ════════
      // Only runs when regex + saved rules couldn't find a field.
      // Fields marked "rule" or "regex" are SKIPPED — no redundant AI calls.
      // Once AI finds a value it is immediately saved as a rule (static if the
      // value doesn't appear in the extracted text) so future PDFs from the
      // same carrier never reach this branch.
      const missingAfterRegex = (
        Object.keys(fieldSources) as ExtractionField[]
      ).filter((f) => fieldSources[f] === "none");

      if (missingAfterRegex.length > 0) {
        console.log(
          `🤖 Calling AI for ${missingAfterRegex.length} field(s): ${missingAfterRegex.join(", ")}`,
        );
        setAiExtracting(true);
        try {
          const page1 = await pdf.getPage(1);
          const viewport = page1.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page1.render({ canvasContext: ctx, viewport }).promise;
            const base64 = canvas
              .toDataURL("image/png", 0.9)
              .replace(/^data:image\/png;base64,/, "");

            const aiRes = await fetch("/api/ai-extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pageImageBase64: base64,
                missingFields: missingAfterRegex,
              }),
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              if (aiData.success && aiData.extracted) {
                const aiExtracted = aiData.extracted as Record<string, string>;

                for (const field of missingAfterRegex) {
                  const value = aiExtracted[field];
                  if (!value) continue;
                  const cleanValue = value.trim();

                  // Assign extracted value
                  if (field === "policyNumber") {
                    policyNumber = cleanValue;
                    fieldSources.policyNumber = "ai";
                  } else if (field === "companyName") {
                    companyName = cleanValue;
                    fieldSources.companyName = "ai";
                  } else if (field === "insuredName") {
                    insuredName = cleanValue;
                    fieldSources.insuredName = "ai";
                  } else if (field === "effectiveDate") {
                    effectiveDate = cleanValue;
                    fieldSources.effectiveDate = "ai";
                  } else if (field === "expirationDate") {
                    expirationDate = cleanValue;
                    fieldSources.expirationDate = "ai";
                  }

                  // Determine whether the value exists in the PDF text.
                  // If it doesn't (e.g. company name from a logo image),
                  // save as a STATIC rule tied purely to the fingerprint.
                  const valueIdx = fullText.indexOf(cleanValue);
                  const appearsInText = valueIdx >= 0;
                  const isStatic = !appearsInText;

                  const matchedChunk = appearsInText ? cleanValue : "";
                  const contextBefore = appearsInText
                    ? fullText
                        .substring(Math.max(0, valueIdx - 30), valueIdx)
                        .trim()
                    : "";
                  const contextAfter = appearsInText
                    ? fullText
                        .substring(
                          valueIdx + cleanValue.length,
                          valueIdx + cleanValue.length + 30,
                        )
                        .trim()
                    : "";

                  const saved = await saveExtractionRule({
                    carrierFingerprint: fingerprint,
                    carrierLabel: label,
                    field,
                    matchedChunk,
                    extractedValue: cleanValue,
                    contextBefore,
                    contextAfter,
                    isStatic,
                  });
                  console.log(
                    `  💾 ${saved ? "Saved" : "Failed to save"} AI rule for ${field}${isStatic ? " [static/logo]" : ""}`,
                  );
                }
              }
            } else {
              console.warn("AI extract failed:", await aiRes.text());
            }
          }
        } catch (aiErr) {
          console.warn("AI extraction skipped:", aiErr);
        }
        setAiExtracting(false);
      } else {
        console.log(
          `✅ All fields resolved via rules/regex — AI not needed for this carrier`,
        );
      }

      console.log(`📄 Extraction sources:`, fieldSources);
      console.log(`🏷️  Carrier: ${label} (${fingerprint})`);

      return {
        policyNumber,
        companyName,
        insuredName,
        effectiveDate,
        expirationDate,
        fieldSources,
        carrierFingerprint: fingerprint,
        carrierLabel: label,
        rawChunks,
      };
    } catch (err) {
      console.error("Extract policy info failed:", err);
      return {
        policyNumber: null,
        companyName: null,
        insuredName: null,
        effectiveDate: null,
        expirationDate: null,
        fieldSources,
        carrierFingerprint: null,
        carrierLabel: null,
        rawChunks: [],
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

      setExtractingPolicy(true);
      const info = await extractPolicyInfoFromPdf(arr[0]);
      setExtractedInfo(info);
      setExtractingPolicy(false);
      console.log("📄 Extracted policy info:", info);
    }

    if (companyAppRef.current) companyAppRef.current.value = "";
  };

  // ─── Render a PDF page into the canvas + overlay clickable text AND image items ───
  const renderPdfPageForPicking = async (pageNum: number) => {
    if (!modalPdfDoc) return;
    const canvas = pdfCanvasRef.current;
    const overlay = pdfOverlayRef.current;
    if (!canvas || !overlay) return;

    const page = await modalPdfDoc.getPage(pageNum);

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1100 / baseViewport.width, 1.8);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport }).promise;

    overlay.innerHTML = "";
    const textContent = await page.getTextContent();

    const regions = mergeAdjacentTextItems(
      textContent.items,
      scale,
      viewport.height,
    );

    // ════════ DETECT IMAGE REGIONS (logos) ════════
    const imageRegions: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    try {
      const opList = await page.getOperatorList();
      const pdfjsLib = (window as any).pdfjsLib;
      const OPS = pdfjsLib.OPS;

      const transformStack: number[][] = [[1, 0, 0, 1, 0, 0]];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (fn === OPS.save) {
          transformStack.push([...transformStack[transformStack.length - 1]]);
        } else if (fn === OPS.restore) {
          if (transformStack.length > 1) transformStack.pop();
        } else if (fn === OPS.transform) {
          const current = transformStack[transformStack.length - 1];
          const [a, b, c, d, e, f] = args;
          const [ca, cb, cc, cd, ce, cf] = current;
          transformStack[transformStack.length - 1] = [
            ca * a + cc * b,
            cb * a + cd * b,
            ca * c + cc * d,
            cb * c + cd * d,
            ca * e + cc * f + ce,
            cb * e + cd * f + cf,
          ];
        } else if (
          fn === OPS.paintImageXObject ||
          fn === OPS.paintJpegXObject ||
          fn === OPS.paintInlineImageXObject
        ) {
          const t = transformStack[transformStack.length - 1];
          const imgWidth = Math.abs(t[0]);
          const imgHeight = Math.abs(t[3]);
          const pdfX = t[4];
          const pdfYBottom = t[5];

          const canvasX = pdfX * scale;
          const canvasY = viewport.height - (pdfYBottom + imgHeight) * scale;
          const canvasW = imgWidth * scale;
          const canvasH = imgHeight * scale;

          if (canvasW < 30 || canvasH < 15) continue;
          if (canvasW > viewport.width * 0.9 && canvasH > viewport.height * 0.9)
            continue;

          imageRegions.push({
            x: canvasX,
            y: canvasY,
            width: canvasW,
            height: canvasH,
          });
        }
      }
    } catch (err) {
      console.warn("Could not walk operator list for images:", err);
    }

    // Build multi-word merged regions for names / multi-part values
    const multiWordRegions: typeof regions = [];
    for (let i = 0; i < regions.length; i++) {
      const a = regions[i];
      const b = regions[i + 1];
      const c = regions[i + 2];
      if (
        b &&
        Math.abs(a.y - b.y) < a.height * 0.5 &&
        b.x - (a.x + a.width) < 30
      ) {
        multiWordRegions.push({
          text: `${a.text} ${b.text}`,
          x: a.x,
          y: Math.min(a.y, b.y),
          width: b.x + b.width - a.x,
          height: Math.max(a.height, b.height),
        });
        if (
          c &&
          Math.abs(b.y - c.y) < b.height * 0.5 &&
          c.x - (b.x + b.width) < 30
        ) {
          multiWordRegions.push({
            text: `${a.text} ${b.text} ${c.text}`,
            x: a.x,
            y: Math.min(a.y, b.y, c.y),
            width: c.x + c.width - a.x,
            height: Math.max(a.height, b.height, c.height),
          });
        }
      }
    }

    // Render clickable text regions
    regions.forEach((region) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const PADDING = 3;
      btn.style.cssText = `
        position: absolute;
        left: ${region.x - PADDING}px;
        top: ${region.y - PADDING}px;
        width: ${region.width + PADDING * 2}px;
        height: ${region.height + PADDING * 2}px;
        background: transparent;
        border: 1px solid transparent;
        cursor: pointer;
        padding: 0;
        margin: 0;
        border-radius: 3px;
        transition: all 0.15s ease;
      `;
      btn.title = region.text;
      btn.onmouseenter = () => {
        btn.style.background = "rgba(139, 92, 246, 0.15)";
        btn.style.border = "1px solid rgba(139, 92, 246, 0.5)";
      };
      btn.onmouseleave = () => {
        btn.style.background = "transparent";
        btn.style.border = "1px solid transparent";
      };
      btn.onclick = (e) => {
        e.preventDefault();

        const clickCenterX = region.x + region.width / 2;
        const clickCenterY = region.y + region.height / 2;

        if (currentMissingField) {
          const validator = FIELD_VALIDATORS[currentMissingField];
          if (validator.test(region.text)) {
            handlePdfItemClick(region.text, region);
            return;
          }
          const matchingMultiWord = multiWordRegions.find(
            (m) =>
              clickCenterX >= m.x &&
              clickCenterX <= m.x + m.width &&
              clickCenterY >= m.y &&
              clickCenterY <= m.y + m.height &&
              validator.test(m.text),
          );
          if (matchingMultiWord) {
            handlePdfItemClick(matchingMultiWord.text, matchingMultiWord);
            return;
          }
          handlePdfItemClick(region.text, region, true);
          return;
        }

        handlePdfItemClick(region.text, region);
      };
      overlay.appendChild(btn);
    });

    // ════════ Render clickable LOGO regions ════════
    imageRegions.forEach((region) => {
      const isCompanyActive = currentMissingField === "companyName";
      const btn = document.createElement("button");
      btn.type = "button";
      const PADDING = 4;
      btn.style.cssText = `
        position: absolute;
        left: ${region.x - PADDING}px;
        top: ${region.y - PADDING}px;
        width: ${region.width + PADDING * 2}px;
        height: ${region.height + PADDING * 2}px;
        background: ${isCompanyActive ? "rgba(20, 184, 166, 0.08)" : "transparent"};
        border: ${isCompanyActive ? "2px dashed rgba(20, 184, 166, 0.5)" : "1px dashed rgba(156, 163, 175, 0.4)"};
        cursor: ${isCompanyActive ? "pointer" : "help"};
        padding: 0;
        margin: 0;
        border-radius: 6px;
        transition: all 0.15s ease;
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
      `;
      const badge = document.createElement("span");
      badge.textContent = isCompanyActive ? "Click to identify" : "Logo";
      badge.style.cssText = `
        position: absolute;
        top: -10px;
        right: 4px;
        background: ${isCompanyActive ? "rgb(20, 184, 166)" : "rgba(156, 163, 175, 0.8)"};
        color: white;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        pointer-events: none;
        white-space: nowrap;
      `;
      btn.appendChild(badge);

      btn.title = isCompanyActive
        ? "Click to identify this logo with AI"
        : "This is a logo — useful for identifying the company";

      btn.onmouseenter = () => {
        if (isCompanyActive) {
          btn.style.background = "rgba(20, 184, 166, 0.2)";
          btn.style.border = "2px dashed rgba(20, 184, 166, 0.8)";
        }
      };
      btn.onmouseleave = () => {
        if (isCompanyActive) {
          btn.style.background = "rgba(20, 184, 166, 0.08)";
          btn.style.border = "2px dashed rgba(20, 184, 166, 0.5)";
        }
      };

      btn.onclick = async (e) => {
        e.preventDefault();
        if (!isCompanyActive) {
          handlePdfItemClick(
            "(logo — only use for company name)",
            region,
            true,
          );
          return;
        }
        await identifyLogoWithAi(region);
      };

      overlay.appendChild(btn);
    });
  };

  // Crop a region from the rendered canvas and send to AI for identification.
  // The result is saved as a STATIC rule so this carrier's logo is never
  // sent to the AI again.
  const identifyLogoWithAi = async (region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const canvas = pdfCanvasRef.current;
    if (!canvas || !currentMissingField) return;

    const PAD = 10;
    const cropX = Math.max(0, region.x - PAD);
    const cropY = Math.max(0, region.y - PAD);
    const cropW = Math.min(canvas.width - cropX, region.width + PAD * 2);
    const cropH = Math.min(canvas.height - cropY, region.height + PAD * 2);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return;

    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const base64 = cropCanvas
      .toDataURL("image/png")
      .replace(/^data:image\/png;base64,/, "");

    setLastClickedBox(region);
    setPendingClick({
      field: currentMissingField,
      value: "Recognizing logo...",
      box: region,
      isInvalid: false,
    });

    try {
      const res = await fetch("/api/ai-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageImageBase64: base64,
          missingFields: [],
          logoOnly: true,
        }),
      });
      if (!res.ok) throw new Error(`AI returned ${res.status}`);
      const data = await res.json();
      const identified = data?.extracted?.companyName;
      if (identified && typeof identified === "string") {
        setPendingClick({
          field: currentMissingField,
          value: identified,
          box: region,
          isInvalid: !FIELD_VALIDATORS.companyName.test(identified),
        });
        // Save immediately as a static rule so this carrier's logo is
        // never sent to the API again on future uploads
        if (
          extractedInfo?.carrierFingerprint &&
          FIELD_VALIDATORS.companyName.test(identified)
        ) {
          const saved = await saveExtractionRule({
            carrierFingerprint: extractedInfo.carrierFingerprint,
            carrierLabel: extractedInfo.carrierLabel,
            field: "companyName",
            matchedChunk: "",
            extractedValue: identified.trim(),
            contextBefore: "",
            contextAfter: "",
            isStatic: true,
          });
          console.log(
            `  💾 ${saved ? "Saved" : "Failed to save"} static logo rule for company: ${identified}`,
          );
        }
      } else {
        setPendingClick({
          field: currentMissingField,
          value: "",
          box: region,
          isInvalid: true,
        });
      }
    } catch (err) {
      console.error("Logo identification failed:", err);
      setPendingClick({
        field: currentMissingField,
        value: "",
        box: region,
        isInvalid: true,
      });
    }
  };

  // ─── User clicked a text item on the PDF ────────────────────────────────
  const handlePdfItemClick = (
    clickedText: string,
    box: { x: number; y: number; width: number; height: number },
    forceInvalid = false,
  ) => {
    if (!currentMissingField) return;

    const validator = FIELD_VALIDATORS[currentMissingField];
    const isValid = !forceInvalid && validator.test(clickedText);

    setLastClickedBox(box);

    setPendingClick({
      field: currentMissingField,
      value: clickedText,
      box,
      isInvalid: !isValid,
    });
  };

  // User confirms the pending click → save + advance
  const confirmPendingClick = () => {
    if (!pendingClick) return;

    const newCorrections: CorrectionMap = {
      ...corrections,
      [pendingClick.field]: {
        value: pendingClick.value.trim(),
        matchedChunk: pendingClick.value.trim(),
      },
    };
    setCorrections(newCorrections);

    const remaining = missingFieldsQueue.filter(
      (f) => f !== pendingClick.field,
    );
    setMissingFieldsQueue(remaining);
    setPendingClick(null);
    setLastClickedBox(null);

    if (remaining.length > 0) {
      setCurrentMissingField(remaining[0]);
    } else {
      setCurrentMissingField(null);
      handleSaveCorrectionsFromModal(newCorrections);
    }
  };

  const rejectPendingClick = () => {
    setPendingClick(null);
    setLastClickedBox(null);
  };

  const updatePendingValue = (newValue: string) => {
    if (!pendingClick) return;
    setPendingClick({ ...pendingClick, value: newValue });
  };

  const goBackOneField = () => {
    if (!currentMissingField || !extractedInfo) return;

    const fieldOrder: ExtractionField[] = [
      "insuredName",
      "policyNumber",
      "companyName",
      "effectiveDate",
      "expirationDate",
    ];
    const allMissing = fieldOrder.filter(
      (f) =>
        extractedInfo.fieldSources[f] === "none" ||
        extractedInfo.fieldSources[f] === "regex",
    );

    const currentIdx = allMissing.indexOf(currentMissingField);
    if (currentIdx <= 0) return;

    const previousField = allMissing[currentIdx - 1];
    setCorrections((prev) => ({ ...prev, [previousField]: null }));
    setMissingFieldsQueue([previousField, ...missingFieldsQueue]);
    setCurrentMissingField(previousField);
    setPendingClick(null);
    setLastClickedBox(null);
  };

  // ─── Open the PDF modal ──────────────────────────────────────────────────
  const openCorrectionModal = async () => {
    if (!companyApp || !extractedInfo) return;

    const fieldOrder: ExtractionField[] = [
      "insuredName",
      "policyNumber",
      "companyName",
      "effectiveDate",
      "expirationDate",
    ];
    const queue = fieldOrder.filter(
      (f) =>
        extractedInfo.fieldSources[f] === "none" ||
        extractedInfo.fieldSources[f] === "regex",
    );

    if (queue.length === 0) return;

    setCorrections({
      policyNumber: {
        value: extractedInfo.policyNumber || "",
        matchedChunk: "",
      },
      companyName: {
        value: extractedInfo.companyName || "",
        matchedChunk: "",
      },
      insuredName: {
        value: extractedInfo.insuredName || "",
        matchedChunk: "",
      },
      effectiveDate: {
        value: extractedInfo.effectiveDate || "",
        matchedChunk: "",
      },
      expirationDate: {
        value: extractedInfo.expirationDate || "",
        matchedChunk: "",
      },
    });

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await companyApp.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setModalPdfDoc(pdf);
      setModalTotalPages(pdf.numPages);
      setModalPageNum(1);
      setMissingFieldsQueue(queue);
      setCurrentMissingField(queue[0]);
      setPdfModalOpen(true);
    } catch (err) {
      console.error("Failed to load PDF for modal:", err);
    }
  };

  // Re-render the PDF when modal opens or page changes or active field changes
  useEffect(() => {
    if (pdfModalOpen && modalPdfDoc) {
      renderPdfPageForPicking(modalPageNum);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfModalOpen, modalPdfDoc, modalPageNum, currentMissingField]);

  // ─── Save user corrections as extraction rules ───────────────────────────
  // For each corrected field we determine whether the value appears in the
  // PDF text:
  //   - If yes  → normal rule with chunk + context
  //   - If no   → static rule (fingerprint-only) — covers logo-identified
  //               company names that the user typed in manually
  const handleSaveCorrectionsFromModal = async (
    overrideCorrections?: CorrectionMap,
  ) => {
    if (!extractedInfo || !extractedInfo.carrierFingerprint) {
      setPdfModalOpen(false);
      return;
    }

    const correctionsToSave = overrideCorrections || corrections;

    setSavingCorrections(true);
    const fullText = extractedInfo.rawChunks.join(" ");
    let savedCount = 0;

    for (const field of Object.keys(correctionsToSave) as ExtractionField[]) {
      const correction = correctionsToSave[field];
      if (!correction || !correction.value.trim() || !correction.matchedChunk) {
        continue;
      }

      const valueIdx = fullText.indexOf(correction.matchedChunk);
      const appearsInText = valueIdx >= 0;
      const isStatic = !appearsInText;

      let contextBefore = "";
      let contextAfter = "";
      if (appearsInText) {
        contextBefore = fullText
          .substring(Math.max(0, valueIdx - 30), valueIdx)
          .trim();
        contextAfter = fullText
          .substring(
            valueIdx + correction.matchedChunk.length,
            valueIdx + correction.matchedChunk.length + 30,
          )
          .trim();
      }

      const saved = await saveExtractionRule({
        carrierFingerprint: extractedInfo.carrierFingerprint,
        carrierLabel: extractedInfo.carrierLabel,
        field,
        matchedChunk: correction.matchedChunk,
        extractedValue: correction.value.trim(),
        contextBefore,
        contextAfter,
        isStatic,
      });
      if (saved) savedCount++;
    }

    const updated: ExtractedInfo = {
      ...extractedInfo,
      policyNumber:
        correctionsToSave.policyNumber?.value.trim() ||
        extractedInfo.policyNumber,
      companyName:
        correctionsToSave.companyName?.value.trim() ||
        extractedInfo.companyName,
      insuredName:
        correctionsToSave.insuredName?.value.trim() ||
        extractedInfo.insuredName,
      effectiveDate:
        correctionsToSave.effectiveDate?.value.trim() ||
        extractedInfo.effectiveDate,
      expirationDate:
        correctionsToSave.expirationDate?.value.trim() ||
        extractedInfo.expirationDate,
      fieldSources: { ...extractedInfo.fieldSources },
    };
    for (const field of Object.keys(correctionsToSave) as ExtractionField[]) {
      const c = correctionsToSave[field];
      if (c?.matchedChunk && c.value.trim()) {
        updated.fieldSources[field] = "rule";
      }
    }
    setExtractedInfo(updated);
    setCorrections({
      policyNumber: null,
      companyName: null,
      insuredName: null,
      effectiveDate: null,
      expirationDate: null,
    });
    setPdfModalOpen(false);
    setCurrentMissingField(null);
    setMissingFieldsQueue([]);
    setPendingClick(null);
    setLastClickedBox(null);
    setSavingCorrections(false);
    console.log(`✅ Saved ${savedCount} extraction rule(s)`);
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
            carrierFingerprint: extractedInfo?.carrierFingerprint || null,
            carrierLabel: extractedInfo?.carrierLabel || null,
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
    setPdfModalOpen(false);
    setCurrentMissingField(null);
    setMissingFieldsQueue([]);
    setLastClickedBox(null);
    setPendingClick(null);
    setCorrections({
      policyNumber: null,
      companyName: null,
      insuredName: null,
      effectiveDate: null,
      expirationDate: null,
    });
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

  const missingFieldLabel = (f: ExtractionField) =>
    f === "policyNumber"
      ? "policy number"
      : f === "companyName"
        ? "company name"
        : f === "insuredName"
          ? "insured name"
          : f === "effectiveDate"
            ? "effective date"
            : "expiration date";

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
                      setPdfModalOpen(false);
                      setPendingClick(null);
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
                        {aiExtracting
                          ? "Reading logos and text with AI..."
                          : "Reading policy document..."}
                      </p>
                    ) : extractedInfo ? (
                      <>
                        <div className="space-y-0.5 text-gray-700">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-blue-900">
                              <Sparkles className="w-3 h-3 inline mr-1" />
                              Extracted from PDF:
                            </p>
                            {extractedInfo.carrierLabel && (
                              <span className="text-[10px] text-gray-500 italic">
                                Carrier: {extractedInfo.carrierLabel}
                              </span>
                            )}
                          </div>

                          {(
                            [
                              [
                                "Insured",
                                "insuredName",
                                extractedInfo.insuredName,
                              ],
                              [
                                "Policy #",
                                "policyNumber",
                                extractedInfo.policyNumber,
                              ],
                              [
                                "Company",
                                "companyName",
                                extractedInfo.companyName,
                              ],
                              [
                                "Effective",
                                "effectiveDate",
                                extractedInfo.effectiveDate,
                              ],
                              [
                                "Expires",
                                "expirationDate",
                                extractedInfo.expirationDate,
                              ],
                            ] as const
                          ).map(([label, key, value]) => {
                            const source = extractedInfo.fieldSources[key];
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <span className="text-gray-500 min-w-[70px]">
                                  {label}:
                                </span>
                                <span className="flex-1">
                                  {value || (
                                    <em className="text-amber-600">
                                      not found
                                    </em>
                                  )}
                                </span>
                                {source === "rule" && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">
                                    LEARNED
                                  </span>
                                )}
                                {source === "ai" && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-semibold">
                                    AI
                                  </span>
                                )}
                                {source === "regex" && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">
                                    AUTO
                                  </span>
                                )}
                                {source === "none" && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">
                                    MISSING
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {Object.values(extractedInfo.fieldSources).some(
                          (s) => s === "none" || s === "regex",
                        ) && (
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <button
                              type="button"
                              onClick={openCorrectionModal}
                              className="w-full text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
                            >
                              <Sparkles className="w-3 h-3" />
                              Fix extraction — click values on the PDF
                            </button>
                            <p className="text-[10px] text-gray-500 mt-1 text-center">
                              Help the system learn this carrier&apos;s format —
                              next time it&apos;ll extract automatically
                            </p>
                          </div>
                        )}
                      </>
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

      {/* ═══════ PDF Click-to-Teach Modal ═══════ */}
      {pdfModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {currentMissingField ? (
                    <>
                      <p className="text-xs uppercase tracking-wider opacity-80">
                        Click the text{" "}
                        {currentMissingField === "companyName" ? "or logo" : ""}{" "}
                        on the PDF:
                      </p>
                      <h3 className="text-lg font-bold mt-0.5">
                        Where is the{" "}
                        <span className="underline decoration-white/50 underline-offset-4">
                          {missingFieldLabel(currentMissingField)}
                        </span>
                        ?
                      </h3>
                      {currentMissingField === "companyName" && (
                        <p className="text-[11px] mt-1 opacity-90">
                          💡 If the name is only a logo, click the logo — AI
                          will identify it and remember it for this carrier
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-semibold">
                      Saving your corrections…
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfModalOpen(false);
                    setCurrentMissingField(null);
                    setMissingFieldsQueue([]);
                    setLastClickedBox(null);
                    setPendingClick(null);
                  }}
                  className="ml-4 p-2 hover:bg-white/20 rounded-lg transition"
                  title="Close without saving"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress indicator */}
              {(missingFieldsQueue.length > 0 || currentMissingField) && (
                <div className="flex items-center gap-1.5 mt-3">
                  {(
                    [
                      "insuredName",
                      "policyNumber",
                      "companyName",
                      "effectiveDate",
                      "expirationDate",
                    ] as ExtractionField[]
                  )
                    .filter((f) => {
                      const source = extractedInfo?.fieldSources[f];
                      return source === "none" || source === "regex";
                    })
                    .map((f) => {
                      const isDone = !missingFieldsQueue.includes(f);
                      const isActive = f === currentMissingField;
                      const label =
                        f === "policyNumber"
                          ? "Policy #"
                          : f === "companyName"
                            ? "Company"
                            : f === "insuredName"
                              ? "Insured"
                              : f === "effectiveDate"
                                ? "Effective"
                                : "Expires";
                      return (
                        <div
                          key={f}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition ${
                            isDone && !isActive
                              ? "bg-emerald-400 text-emerald-900"
                              : isActive
                                ? "bg-white text-indigo-700 ring-2 ring-white"
                                : "bg-white/20 text-white"
                          }`}
                        >
                          {isDone && !isActive ? "✓ " : ""}
                          {label}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Pending click confirmation */}
              {pendingClick && (
                <div className="mt-3 bg-white rounded-lg p-3 text-gray-900 shadow-inner">
                  {pendingClick.isInvalid ? (
                    <>
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-red-600 text-xs font-bold">
                            !
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-red-700">
                            That doesn&apos;t look right for this field
                          </p>
                          <p className="text-[11px] text-gray-600 mt-0.5">
                            {FIELD_VALIDATORS[pendingClick.field].hint}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-1">
                            You clicked:{" "}
                            <span className="font-mono bg-red-50 px-1.5 py-0.5 rounded text-red-700">
                              {pendingClick.value}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={rejectPendingClick}
                          className="flex-1 text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md font-semibold hover:bg-gray-200 transition"
                        >
                          Try again
                        </button>
                        <button
                          type="button"
                          onClick={confirmPendingClick}
                          className="flex-1 text-xs px-3 py-1.5 bg-amber-500 text-white rounded-md font-semibold hover:bg-amber-600 transition"
                        >
                          Use it anyway
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-emerald-600 text-xs font-bold">
                            ✓
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-emerald-700">
                            Captured — edit if needed
                          </p>
                          <input
                            type="text"
                            value={pendingClick.value}
                            onChange={(e) => updatePendingValue(e.target.value)}
                            className="w-full mt-1.5 text-sm px-2.5 py-1.5 border border-emerald-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={rejectPendingClick}
                          className="flex-1 text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md font-semibold hover:bg-gray-200 transition"
                        >
                          ← Click different text
                        </button>
                        <button
                          type="button"
                          onClick={confirmPendingClick}
                          className="flex-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 transition"
                        >
                          ✓ Yes, save this
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* PDF viewer area */}
            <div className="flex-1 overflow-auto p-4 bg-gray-100 relative">
              <div
                className="relative inline-block mx-auto"
                style={{ minWidth: "100%" }}
              >
                <div className="relative inline-block">
                  <canvas
                    ref={pdfCanvasRef}
                    className="block shadow-lg rounded"
                    style={{ display: "block" }}
                  />
                  <div
                    ref={pdfOverlayRef}
                    className="absolute top-0 left-0"
                    style={{ pointerEvents: "auto" }}
                  />
                  {/* Click highlight box */}
                  {lastClickedBox && pendingClick && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${lastClickedBox.x - 3}px`,
                        top: `${lastClickedBox.y - 3}px`,
                        width: `${lastClickedBox.width + 6}px`,
                        height: `${lastClickedBox.height + 6}px`,
                        background: pendingClick.isInvalid
                          ? "rgba(239, 68, 68, 0.25)"
                          : "rgba(139, 92, 246, 0.25)",
                        border: `2px solid ${pendingClick.isInvalid ? "rgb(239, 68, 68)" : "rgb(139, 92, 246)"}`,
                        borderRadius: "4px",
                        boxShadow: `0 0 0 4px ${pendingClick.isInvalid ? "rgba(239, 68, 68, 0.15)" : "rgba(139, 92, 246, 0.15)"}`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t p-3 bg-gray-50 rounded-b-2xl flex items-center justify-between">
              <button
                type="button"
                onClick={() => setModalPageNum((p) => Math.max(1, p - 1))}
                disabled={modalPageNum <= 1}
                className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Previous
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600 font-medium">
                  Page {modalPageNum} of {modalTotalPages}
                </span>
                {savingCorrections && (
                  <span className="text-xs text-indigo-600 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving rules…
                  </span>
                )}
                {currentMissingField && !pendingClick && (
                  <button
                    type="button"
                    onClick={goBackOneField}
                    className="text-[11px] px-2 py-1 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 transition"
                  >
                    ↶ Redo previous field
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setModalPageNum((p) => Math.min(modalTotalPages, p + 1))
                }
                disabled={modalPageNum >= modalTotalPages}
                className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
