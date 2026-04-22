// app/[locale]/admin/pdf-merger/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
  // Perceptual hashes of every logo on page 1. Used when saving
  // AI-identified company names so the hash travels with the rule.
  logoHashes: string[];
}

interface SavedRule {
  field: ExtractionField;
  matchedChunk: string;
  extractedValue: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: string;
  version: number;
  // Static rules (e.g. logo-identified company name) match purely by
  // carrier fingerprint or logo hash — no PDF-text chunk needed.
  isStatic?: boolean;
  // Perceptual hash of the logo. When present, this rule can be applied by
  // finding a visually similar logo on a future PDF — robust across
  // carriers whose text content varies per customer.
  logoHash?: string;
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
    // Accept any text that CONTAINS a date — handles "04/17/2026 12:01 AM" etc.
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

// ─── Extract the top of page 1 as a PNG, send to Vision API ──────────────
// Only called when text-based company name extraction fails. Renders the top
// ~25% of page 1 (the header/logo area) into a canvas, converts to base64 PNG,
// sends to our server-side route which calls OpenAI Vision.
const extractCompanyFromLogo = async (
  pdfDoc: any,
  loadPdfJsFn: () => Promise<any>,
): Promise<string | null> => {
  try {
    await loadPdfJsFn(); // ensure lib is loaded
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // sharper for OCR

    const canvas = document.createElement("canvas");
    // Only render top 30% — where logos live
    const headerHeight = Math.round(viewport.height * 0.3);
    canvas.width = viewport.width;
    canvas.height = headerHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // White background (some PDFs render transparent)
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render page but clip to top region by translating canvas
    await page.render({
      canvasContext: ctx,
      viewport,
      // no intent param needed — we'll just crop via canvas size
    }).promise;

    const base64 = canvas.toDataURL("image/png");

    const res = await fetch("/api/extract-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    const data = await res.json();

    if (data.success && data.companyName) {
      console.log(`🤖 Vision identified carrier: ${data.companyName}`);
      return data.companyName;
    }
    console.log("🤖 Vision could not identify carrier");
    return null;
  } catch (err) {
    console.error("Logo extraction failed:", err);
    return null;
  }
};

// ─── Fingerprint: build a STABLE key tied to the carrier's document template,
// not to per-customer data. Previous approach used raw page1Text which
// changed per customer (different agent/address) causing learned rules to
// miss on subsequent uploads. New approach extracts structural anchors.
const computeCarrierFingerprint = (
  page1Text: string,
): { fingerprint: string; label: string } => {
  const head = page1Text.substring(0, 400);

  // Extract a human-readable label (same as before)
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

  // Build a STABLE fingerprint from STRUCTURAL anchors that appear in every
  // policy from this carrier regardless of customer:
  // - Carrier name fragments ("Safeway", "Connect MGA", etc.)
  // - Form codes (e.g. "TX-734SIC", "TXCOV 0713")
  // - NAIC numbers
  // - P.O. Box / address patterns specific to the carrier's home office
  // - Standard phrases like "Policy Number:", "Agent / Broker:"
  const anchors: string[] = [];

  // 1. Carrier-name-like strings in head
  const carrierTokens = head.match(
    /[A-Z][A-Za-z&'\-]+(?:\s+[A-Z][A-Za-z&'\-]+){0,2}\s+(?:Insurance|Mutual|Specialty|Risk|Company|Agency|MGA)/g,
  );
  if (carrierTokens) anchors.push(...carrierTokens.slice(0, 3));

  // 2. Form / document codes (e.g. TX-734SIC, TXCOV 0713, #201)
  const formCodes = page1Text.match(
    /\b(?:TX[A-Z]?[\-\s]?\d{2,}[A-Z]*|#\d{3,}|[A-Z]{2,}[\-\s]?\d{4,})\b/g,
  );
  if (formCodes) anchors.push(...formCodes.slice(0, 5));

  // 3. NAIC identifier
  const naic = page1Text.match(/NAIC:?\s*(\d{4,6})/i);
  if (naic) anchors.push(`NAIC${naic[1]}`);

  // 4. Carrier home-office city/state patterns like "Lafayette, LA 70509"
  //    Strip the street/number portion so it's stable across agents
  const cityStateZip = page1Text.match(
    /(?:P\.?O\.?\s*Box\s+\d+,?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}\s+\d{5})/g,
  );
  if (cityStateZip) anchors.push(...cityStateZip.slice(0, 2));

  // 5. Standard headers (helps distinguish templates)
  const standardHeaders = page1Text.match(
    /(?:Policy\s+(?:Number|Period)|Agent\s*\/\s*Broker|Named\s+Insured|Effective\s+Date|Declarations?\s+Page)/gi,
  );
  if (standardHeaders) anchors.push(...standardHeaders.slice(0, 3));

  // If we got structural anchors, use them. Otherwise fall back to the old
  // method so fingerprinting still works on unusual documents.
  let fingerprintSource: string;
  if (anchors.length >= 3) {
    fingerprintSource = anchors.join("|");
  } else {
    fingerprintSource = page1Text.substring(0, 120);
  }

  const fingerprint = fingerprintSource
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 100);

  return { fingerprint, label };
};

// ─── Perceptual hash for a logo image ──────────────────────────────────
// Takes a canvas or cropped canvas, downscales to 16x16 grayscale, averages,
// and returns a 64-char hex string where each char represents brightness.
// Two logos from the same carrier will produce nearly-identical hashes.
const computeImageHash = (canvas: HTMLCanvasElement): string => {
  const HASH_SIZE = 16;
  const tmp = document.createElement("canvas");
  tmp.width = HASH_SIZE;
  tmp.height = HASH_SIZE;
  const ctx = tmp.getContext("2d");
  if (!ctx) return "";
  // Disable smoothing for consistent sampling
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, HASH_SIZE, HASH_SIZE);
  const data = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;
  let hex = "";
  for (let i = 0; i < data.length; i += 4) {
    // Grayscale average of RGB, bucketed to 16 levels (0-f)
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const bucket = Math.floor(lum / 16);
    hex += bucket.toString(16);
  }
  return hex;
};

// Hamming distance between two hex-encoded hashes of the same length
const hashDistance = (a: string, b: string): number => {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
};

// ─── Apply a saved rule to current PDF text ──────────────────────────────
const applyRule = (fullText: string, rule: SavedRule): string | null => {
  // Static rules (logo-identified, fingerprint-only, etc.) always return the
  // stored value — no PDF text matching needed.
  if (rule.isStatic) {
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

      // ════════ Render page 1 + compute logo hashes ════════
      // We do this upfront so saved logo-hash rules can be applied BEFORE
      // calling the AI. This is the key to skipping repeat API calls.
      const page1LogoHashes: string[] = [];
      try {
        const page1 = await pdf.getPage(1);
        const viewport = page1.getViewport({ scale: 1.5 });
        const renderCanvas = document.createElement("canvas");
        renderCanvas.width = viewport.width;
        renderCanvas.height = viewport.height;
        const renderCtx = renderCanvas.getContext("2d");
        if (renderCtx) {
          await page1.render({
            canvasContext: renderCtx,
            viewport,
          }).promise;

          // Walk operator list to find image regions
          const opList = await page1.getOperatorList();
          const OPS = pdfjsLib.OPS;
          const transformStack: number[][] = [[1, 0, 0, 1, 0, 0]];
          const imgRegions: Array<{
            x: number;
            y: number;
            w: number;
            h: number;
          }> = [];

          for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];
            if (fn === OPS.save) {
              transformStack.push([
                ...transformStack[transformStack.length - 1],
              ]);
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
              const imgW = Math.abs(t[0]);
              const imgH = Math.abs(t[3]);
              const pdfX = t[4];
              const pdfYBot = t[5];
              const cx = pdfX * 1.5;
              const cy = viewport.height - (pdfYBot + imgH) * 1.5;
              const cw = imgW * 1.5;
              const ch = imgH * 1.5;
              if (cw < 30 || ch < 15) continue;
              if (cw > viewport.width * 0.9 && ch > viewport.height * 0.9)
                continue;
              imgRegions.push({ x: cx, y: cy, w: cw, h: ch });
            }
          }

          // Compute hash for each logo region
          for (const r of imgRegions) {
            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = r.w;
            cropCanvas.height = r.h;
            const cropCtx = cropCanvas.getContext("2d");
            if (!cropCtx) continue;
            cropCtx.drawImage(renderCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
            const hash = computeImageHash(cropCanvas);
            if (hash) page1LogoHashes.push(hash);
          }
          if (page1LogoHashes.length > 0) {
            console.log(
              `🖼️  Computed ${page1LogoHashes.length} logo hash(es) from page 1`,
            );
          }
        }
      } catch (err) {
        console.warn("Could not compute logo hashes:", err);
      }

      const { fingerprint, label } = computeCarrierFingerprint(page1Text);

      // ════════ Load saved rules ════════
      // Strategy: try fingerprint match first. If that misses AND we have
      // logo hashes, ask the server to find any carrier with a matching logo
      // hash — this handles the case where fingerprint drifted but logo is
      // identical (same carrier, different agent).
      let savedRules: SavedCarrierRules | null = null;
      try {
        const params = new URLSearchParams({ fingerprint });
        if (page1LogoHashes.length > 0) {
          params.set("logoHashes", page1LogoHashes.join(","));
        }
        const res = await fetch(`/api/extraction-rules?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.rules) {
          savedRules = data.rules as SavedCarrierRules;
          console.log(
            `📚 Loaded ${savedRules.rules.length} saved rule(s) for ${savedRules.carrierLabel}${data.matchedBy ? ` (matched by ${data.matchedBy})` : ""}`,
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
          // Logo-hash rules first, then static rules, then by version descending
          .sort((a, b) => {
            const aLogo = a.logoHash ? 1 : 0;
            const bLogo = b.logoHash ? 1 : 0;
            if (aLogo !== bLogo) return bLogo - aLogo;
            const aStatic = a.isStatic ? 1 : 0;
            const bStatic = b.isStatic ? 1 : 0;
            if (aStatic !== bStatic) return bStatic - aStatic;
            return b.version - a.version;
          });
        for (const rule of fieldRules) {
          // Logo-hash rules: only fire if a logo on this page matches the hash.
          // These are safe only for companyName — the logo identifies the
          // carrier, which is stable. Never for per-customer fields.
          if (rule.logoHash) {
            if (field !== "companyName") continue;
            const matched = page1LogoHashes.some(
              (h) => hashDistance(h, rule.logoHash!) <= 12,
            );
            if (matched) {
              console.log(
                `  ✓ Logo-hash rule hit for ${field}: ${rule.extractedValue}`,
              );
              return rule.extractedValue;
            }
            continue;
          }

          // Static rules (no text match required) are only safe for the
          // company name. For everything else (dates, policy numbers, insured
          // names) the value MUST be found in this PDF's text — otherwise
          // we'd be returning someone else's data. Skip static non-company rules.
          if (rule.isStatic && field !== "companyName") {
            console.warn(
              `  ⏭️  Skipping unsafe static rule for ${field} — dates/policy/names must match current PDF text`,
            );
            continue;
          }

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

      // ════════ FIELD EXTRACTION ════════
      // Strategy: try saved rules only. Regex pattern matching has been
      // REMOVED because it produced low-quality extractions (e.g. matching
      // "Producer" as a policy number). Any field not found by rules falls
      // through to the AI block below, which has much higher accuracy and
      // saves its result as a rule for future uploads (zero-cost afterwards).

      let policyNumber: string | null = tryRulesFor("policyNumber");
      if (policyNumber) fieldSources.policyNumber = "rule";

      let companyName: string | null = tryRulesFor("companyName");
      if (companyName) fieldSources.companyName = "rule";

      let insuredName: string | null = tryRulesFor("insuredName");
      if (insuredName) fieldSources.insuredName = "rule";

      let effectiveDate: string | null = tryRulesFor("effectiveDate");
      if (effectiveDate) fieldSources.effectiveDate = "rule";

      let expirationDate: string | null = tryRulesFor("expirationDate");
      if (expirationDate) fieldSources.expirationDate = "rule";

      // Split text into clickable chunks (still used for context when saving rules)
      const rawChunks = fullText
        .split(/(?:\s{2,}|(?<=[.:])\s+|\s+(?=[A-Z][A-Za-z]+\s*:))/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && s.length <= 100);

      // ════════ AI EXTRACTION for any fields not covered by saved rules ════════
      // This is the PRIMARY extraction path — regex was removed because it
      // produced too many false positives (e.g. matching "Producer" as a
      // policy number). Once AI extracts a field, it's saved as a rule so
      // subsequent uploads from this carrier skip the API entirely.
      const missingAfterRegex = (
        Object.keys(fieldSources) as ExtractionField[]
      ).filter((f) => fieldSources[f] === "none");

      if (missingAfterRegex.length > 0) {
        console.log(
          `🤖 Calling AI for ${missingAfterRegex.length} missing field(s): ${missingAfterRegex.join(", ")}`,
        );
        setAiExtracting(true);
        try {
          // Render page 1 at 2.5x scale for the AI. Higher resolution =
          // clearer characters = fewer OCR mistakes on fine-grained details
          // (digit pairs like 6 vs 8, 2 vs 7, 0 vs O, 1 vs l vs I).
          // At 2.5x a standard letter page is ~2100px wide — gpt-4o-mini
          // handles this comfortably and dates come through correctly.
          const page1 = await pdf.getPage(1);
          const viewport = page1.getViewport({ scale: 2.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page1.render({
              canvasContext: ctx,
              viewport,
            }).promise;
            // PNG is lossless; the quality arg is ignored for PNG anyway.
            const base64 = canvas
              .toDataURL("image/png")
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

                // ═══ SANITY CHECKS — guard against bad AI extractions ═══
                // If dates don't pass these checks, we still SHOW them (so user
                // sees what AI extracted), but we DON'T save as rules. The
                // user can then click "Fix extraction" to correct manually,
                // and THAT gets saved as the authoritative rule.
                const parseDate = (s: string): Date | null => {
                  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
                  if (!m) return null;
                  let y = parseInt(m[3], 10);
                  if (y < 100) y += 2000;
                  const d = new Date(
                    y,
                    parseInt(m[1], 10) - 1,
                    parseInt(m[2], 10),
                  );
                  return isNaN(d.getTime()) ? null : d;
                };

                const suspiciousFields = new Set<string>();
                const effStr = aiExtracted.effectiveDate;
                const expStr = aiExtracted.expirationDate;
                if (effStr && expStr) {
                  const effD = parseDate(effStr);
                  const expD = parseDate(expStr);
                  if (effD && expD) {
                    const diffDays =
                      (expD.getTime() - effD.getTime()) / (1000 * 60 * 60 * 24);
                    // Valid policy term: 30-400 days (covers 1mo through 13mo)
                    if (diffDays < 30 || diffDays > 400) {
                      console.warn(
                        `⚠️  Dates look suspicious: ${effStr} → ${expStr} (${Math.round(diffDays)} days apart). Not saving as rules.`,
                      );
                      suspiciousFields.add("effectiveDate");
                      suspiciousFields.add("expirationDate");
                    }
                  }
                }

                // Apply AI results + conditionally save as rules for future PDFs
                for (const field of missingAfterRegex) {
                  const value = aiExtracted[field];
                  if (!value) continue;
                  const cleanValue = value.trim();

                  // Assign to the right variable + mark source
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

                  // Skip saving this field as a rule if it failed sanity check
                  if (suspiciousFields.has(field)) {
                    console.warn(
                      `  ⏭️  Skipped saving rule for ${field} — failed sanity check`,
                    );
                    continue;
                  }

                  // Determine whether this value exists in the PDF text.
                  // If it doesn't (e.g. company name came only from a logo
                  // image), save as a STATIC rule and tag it with the first
                  // logo hash on the page so future uploads can match on
                  // the logo even if fingerprint drifts.
                  const valueIdx = fullText.indexOf(cleanValue);
                  const appearsInText = valueIdx >= 0;
                  const isStaticRule = !appearsInText;

                  // NEVER save date fields as static rules. Dates change per
                  // policy — a "static" date rule would return the same value
                  // for every future PDF. If AI's extracted date isn't in the
                  // text, it was likely hallucinated; skip saving entirely.
                  if (
                    isStaticRule &&
                    (field === "effectiveDate" ||
                      field === "expirationDate" ||
                      field === "policyNumber" ||
                      field === "insuredName")
                  ) {
                    console.warn(
                      `  ⏭️  Skipped saving ${field} rule — value "${cleanValue}" not found in PDF text (likely AI misread)`,
                    );
                    continue;
                  }

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

                  // Attach a logo hash only for companyName when the value
                  // isn't in the text (i.e. it definitely came from a logo)
                  const logoHashForRule =
                    field === "companyName" &&
                    isStaticRule &&
                    page1LogoHashes.length > 0
                      ? page1LogoHashes[0]
                      : undefined;

                  try {
                    await fetch("/api/extraction-rules", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        carrierFingerprint: fingerprint,
                        carrierLabel: label,
                        field,
                        matchedChunk,
                        extractedValue: cleanValue,
                        contextBefore,
                        contextAfter,
                        isStatic: isStaticRule,
                        logoHash: logoHashForRule,
                      }),
                    });
                    console.log(
                      `  💾 Saved AI rule for ${field}${isStaticRule ? " [static]" : ""}${logoHashForRule ? " [with logo hash]" : ""}`,
                    );
                  } catch (saveErr) {
                    console.warn(
                      `Failed to save AI rule for ${field}:`,
                      saveErr,
                    );
                  }
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
        logoHashes: page1LogoHashes,
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
        logoHashes: [],
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
    // Walk the PDF operator list to find where images are drawn and their bounds
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

      // The current transform matrix [a,b,c,d,e,f] — tracked as PDF walks ops
      // e,f is translation; d is y-scale (height); a is x-scale (width)
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
          // Matrix multiply: new = current * args
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
          // An image is painted at the current transform
          const t = transformStack[transformStack.length - 1];
          // Image unit square (0,0)-(1,1) transformed by t gives image bounds
          // Bottom-left in PDF coords: (e, f)
          // Top-right: (a+c+e, b+d+f) — but for axis-aligned images b=c=0
          const imgWidth = Math.abs(t[0]);
          const imgHeight = Math.abs(t[3]);
          const pdfX = t[4];
          // PDF y is from bottom; image occupies [f, f+d] in PDF coords
          const pdfYBottom = t[5];

          // Convert to canvas coords (y from top)
          const canvasX = pdfX * scale;
          const canvasY = viewport.height - (pdfYBottom + imgHeight) * scale;
          const canvasW = imgWidth * scale;
          const canvasH = imgHeight * scale;

          // Skip tiny images (background patterns, bullets, etc.)
          if (canvasW < 30 || canvasH < 15) continue;
          // Skip images that cover the whole page (backgrounds)
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
    // These are only useful for the companyName field (logos don't contain
    // policy numbers, dates, or names). Show a teal tint when the active field
    // is companyName; show a subtle grey tint otherwise with a "Logo" badge.
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
      // Small badge in corner
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
          // Gentle nudge: if user clicks a logo while asking for something
          // non-company, show a hint in the pending-click UI
          handlePdfItemClick(
            "(logo — only use for company name)",
            region,
            true,
          );
          return;
        }
        // AI-identify the logo
        await identifyLogoWithAi(region);
      };

      overlay.appendChild(btn);
    });
  };

  // Crop a region from the rendered canvas, compute its perceptual hash,
  // send it to OpenAI for identification, then auto-save a rule tagged with
  // both the fingerprint AND the logo hash. Future uploads of the same
  // carrier's PDF will match the logo hash and skip the API entirely.
  const identifyLogoWithAi = async (region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const canvas = pdfCanvasRef.current;
    if (!canvas || !currentMissingField) return;

    // Crop with a bit of padding around the logo
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

    // Compute perceptual hash of this logo — this is what lets us recognize
    // it on future uploads without calling the AI again
    const logoHash = computeImageHash(cropCanvas);

    const base64 = cropCanvas
      .toDataURL("image/png")
      .replace(/^data:image\/png;base64,/, "");

    // Show pending click immediately with a "recognizing..." placeholder
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

        // Auto-save as a static rule with logo hash — next upload of this
        // carrier's PDF will match via the hash and skip the AI entirely
        if (
          extractedInfo?.carrierFingerprint &&
          FIELD_VALIDATORS.companyName.test(identified) &&
          logoHash
        ) {
          try {
            const saveRes = await fetch("/api/extraction-rules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                carrierFingerprint: extractedInfo.carrierFingerprint,
                carrierLabel: extractedInfo.carrierLabel,
                field: "companyName",
                matchedChunk: "",
                extractedValue: identified.trim(),
                contextBefore: "",
                contextAfter: "",
                isStatic: true,
                logoHash,
              }),
            });
            console.log(
              `  💾 ${saveRes.ok ? "Saved" : "Failed to save"} logo-hash rule for "${identified}"`,
            );
          } catch (saveErr) {
            console.warn("Failed to save logo rule:", saveErr);
          }
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

    // Build the updated corrections map synchronously so we can pass it
    // directly to handleSaveCorrectionsFromModal if this was the last field
    // (React state updates don't settle in time otherwise)
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
      // Pass the freshly-built corrections so the last field isn't lost
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

  // Save user corrections as extraction rules
  // Accepts optional override to bypass stale-state race condition on last field
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

      const idx = fullText.indexOf(correction.matchedChunk);
      const appearsInText = idx >= 0;
      const isStatic = !appearsInText;

      // Safety: never save date/policy/name fields as static rules.
      // These vary per customer — a static rule would poison future uploads.
      if (isStatic && field !== "companyName") {
        console.warn(
          `  ⏭️  Skipped saving ${field} correction — value "${correction.value.trim()}" not found in PDF text. Per-policy fields must match the text.`,
        );
        continue;
      }

      let contextBefore = "";
      let contextAfter = "";
      if (appearsInText) {
        contextBefore = fullText.substring(Math.max(0, idx - 30), idx).trim();
        contextAfter = fullText
          .substring(
            idx + correction.matchedChunk.length,
            idx + correction.matchedChunk.length + 30,
          )
          .trim();
      }

      // For companyName, if the value isn't in text, tag with the first
      // logo hash on the page so future uploads match via the logo
      const logoHashForRule =
        field === "companyName" &&
        isStatic &&
        extractedInfo.logoHashes &&
        extractedInfo.logoHashes.length > 0
          ? extractedInfo.logoHashes[0]
          : undefined;

      try {
        const res = await fetch("/api/extraction-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrierFingerprint: extractedInfo.carrierFingerprint,
            carrierLabel: extractedInfo.carrierLabel,
            field,
            matchedChunk: correction.matchedChunk,
            extractedValue: correction.value.trim(),
            contextBefore,
            contextAfter,
            isStatic,
            logoHash: logoHashForRule,
          }),
        });
        if (res.ok) savedCount++;
      } catch (err) {
        console.error(`Failed to save rule for ${field}:`, err);
      }
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

                        {/* Fix extraction button — only show if any field still MISSING or questionable */}
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
                          will identify it
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
