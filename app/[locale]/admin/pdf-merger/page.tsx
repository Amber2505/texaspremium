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
  const [ccReceipt, setCcReceipt] = useState<File | null>(null);
  const [merging, setMerging] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const companyAppRef = useRef<HTMLInputElement>(null);
  const officeReceiptRef = useRef<HTMLInputElement>(null);
  const ccReceiptRef = useRef<HTMLInputElement>(null);
  const extraDocRef = useRef<HTMLInputElement>(null);

  const templates = DOCUMENT_SETS[policyType] ?? [];
  const hasTemplates = templates.length > 0;

  // CC receipt only required when card payment
  const canMerge =
    customerName.trim() &&
    companyApp &&
    officeReceipt &&
    (receiptType === "cash" || ccReceipt);

  // ── Company App: multi-file handler ──────────────────────────────────────
  const handleCompanyAppFiles = (files: FileList) => {
    const arr = Array.from(files).filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (arr.length === 0) return;

    // First file → company app slot
    setCompanyApp(arr[0]);

    // Remaining files → append to extraDocs
    if (arr.length > 1) {
      const newExtras: ExtraDoc[] = arr.slice(1).map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        label: f.name.replace(/\.pdf$/i, ""),
      }));
      setExtraDocs((prev) => [...prev, ...newExtras]);
    }

    if (companyAppRef.current) companyAppRef.current.value = "";
  };

  const handleAddExtraDoc = (file: File) => {
    setExtraDocs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        file,
        label: file.name.replace(/\.pdf$/i, ""),
      },
    ]);
    if (extraDocRef.current) extraDocRef.current.value = "";
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
    {
      num: baseCount + afterCompany + 2 + paymentOffset + nonOwnerOffset,
      label: "Office Receipt",
      type: "upload" as const,
    },
    // Only show CC Receipt row when card is selected
    ...(receiptType === "card"
      ? [
          {
            num: baseCount + afterCompany + 3 + paymentOffset + nonOwnerOffset,
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

      await addPdf(await readFile(officeReceipt!));

      // Only append CC receipt when card payment
      if (receiptType === "card" && ccReceipt) {
        await addPdf(await readFile(ccReceipt));
      }

      const datePart = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}-${today.getFullYear()}`;
      const timePart = `${pad(today.getHours())}-${pad(today.getMinutes())}`;
      const safeName = customerName.trim().replace(/\s+/g, "_");
      const policyLabel = nonOwner ? `${policyType}_NonOwner` : policyType;
      const receiptLabel = receiptType === "cash" ? "_Cash" : "";
      const filename = `${safeName}_${policyLabel}${receiptLabel}_${datePart}_${timePart}.pdf`;

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
    setCcReceipt(null);
    setStatus(null);
    if (companyAppRef.current) companyAppRef.current.value = "";
    if (officeReceiptRef.current) officeReceiptRef.current.value = "";
    if (ccReceiptRef.current) ccReceiptRef.current.value = "";
  };

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePreview = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;

  // ── Auth loading screen ───────────────────────────────────────────────────
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

  // ── Main UI ───────────────────────────────────────────────────────────────
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
                  {receiptType === "cash" ? "_Cash" : ""}_{datePreview}
                  _HH-MM.pdf
                </span>
              </p>
            )}
          </div>

          {/* ── Company Application: multi-file upload ────────────────────── */}
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
                {/* Primary file */}
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
                      if (companyAppRef.current)
                        companyAppRef.current.value = "";
                    }}
                    className="text-green-600 hover:text-red-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Add more button */}
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

            {/* Hidden multi-file input */}
            <input
              ref={companyAppRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleCompanyAppFiles(e.target.files);
                }
              }}
            />
          </div>

          {/* Extra Documents */}
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
            <button
              onClick={() => extraDocRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-2 border-dashed border-green-400 text-green-700 rounded-lg hover:bg-green-100 hover:border-green-500 transition font-medium text-sm w-full justify-center"
            >
              <PlusCircle className="w-5 h-5" />
              Add Extra Document
              <span className="text-xs font-normal text-green-600">
                (inserted after company PDF)
              </span>
            </button>
            <input
              ref={extraDocRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAddExtraDoc(f);
              }}
            />
          </div>

          <FileUploadField
            label="Office Receipt"
            description="The agency office receipt PDF from your system"
            position="10"
            file={officeReceipt}
            inputRef={officeReceiptRef}
            onFileChange={setOfficeReceipt}
            required
          />

          {/* ── Receipt Type Toggle + CC Upload ───────────────────────────── */}
          <div className="pt-1">
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
                  setCcReceipt(null);
                  if (ccReceiptRef.current) ccReceiptRef.current.value = "";
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
              <FileUploadField
                label="Credit Card Receipt"
                description="The Square / terminal CC receipt PDF"
                position="11"
                file={ccReceipt}
                inputRef={ccReceiptRef}
                onFileChange={setCcReceipt}
                required
              />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-emerald-600 text-lg">💵</span>
                <div>
                  <p className="text-sm font-medium text-emerald-800">
                    Cash / In-Office Sale
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    No CC receipt needed — package will end after the office
                    receipt
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
              className={`text-sm font-medium ${
                status.type === "success" ? "text-green-800" : "text-red-800"
              }`}
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
            {receiptType === "cash"
              ? "Fill in customer name and upload company app + office receipt to enable merge"
              : "Fill in customer name and upload all 3 required files to enable merge"}
          </p>
        )}
      </div>
    </div>
  );
}

// ── FileUploadField component ─────────────────────────────────────────────────

interface FileUploadFieldProps {
  label: string;
  description: string;
  position: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (f: File | null) => void;
  required?: boolean;
}

function FileUploadField({
  label,
  description,
  position,
  file,
  inputRef,
  onFileChange,
  required,
}: FileUploadFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">
          {position}
        </span>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <p className="text-xs text-gray-500 mb-2 ml-7">{description}</p>
      {file ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 truncate">
              {file.name}
            </p>
            <p className="text-xs text-green-600">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            onClick={() => {
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-green-600 hover:text-red-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left"
        >
          <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-500">Click to upload PDF</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
        }}
      />
    </div>
  );
}
