"use client";

import { useState, useRef } from "react";
import {
  FileText,
  Upload,
  Download,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlusCircle,
} from "lucide-react";

// ─── DOCUMENT SETS PER POLICY TYPE ───────────────────────────────────────────
type TemplateEntry = { key: string; label: string };

const DOCUMENT_SETS: Record<string, TemplateEntry[]> = {
  Auto: [
    { key: "Acknowledgement form", label: "Acknowledgement of Coverage" },
    // company app inserted here (position 2 — uploaded)
    { key: "515A Exclusion form", label: "Form 515A – Driver Exclusion" },
    { key: "Discount form", label: "Discount & Document Compliance" },
    { key: "Non Business use", label: "Statement of Non-Business Use" },
    { key: "PIP Rejection form", label: "Texas PIP Coverage" },
    { key: "Uninsured Rejection form", label: "Texas UM/UIM Coverage" },
    { key: "Verification letter", label: "Verification of Policy Information" },
    // Recurring CC form added here only when autopay is ON
  ],
};

const POLICY_TYPES = [{ value: "Auto", emoji: "🚗" }];

interface ExtraDoc {
  id: string;
  file: File;
  label: string;
}

export default function PdfMergerPage() {
  const [policyType, setPolicyType] = useState("Auto");
  const [autopay, setAutopay] = useState(true);
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
  const canMerge =
    customerName.trim() && companyApp && officeReceipt && ccReceipt;

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

  // Build the ordered document list for display
  const displayDocs = [
    ...templates.map((t, i) => ({
      num: i === 0 ? 1 : i + 2 + extraDocs.length,
      label: t.label,
      type: "static" as const,
    })),
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
    ...(autopay
      ? [
          {
            num: templates.length + extraDocs.length + 2,
            label: "Recurring CC Authorization",
            type: "static" as const,
          },
        ]
      : []),
    {
      num: templates.length + extraDocs.length + (autopay ? 3 : 2),
      label: "Office Receipt",
      type: "upload" as const,
    },
    {
      num: templates.length + extraDocs.length + (autopay ? 4 : 3),
      label: "Credit Card Receipt",
      type: "upload" as const,
    },
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
        // 515A has no standalone date line — omitted intentionally
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
        for (const extra of extraDocs) {
          await addPdf(await readFile(extra.file));
        }
      } else {
        // 1. Acknowledgement (with date stamp)
        await addPdf(await fetchTemplate(templates[0].key), templates[0].key);
        // 2. Company application
        await addPdf(await readFile(companyApp!));
        // 2b. Extra uploaded docs (right after company app)
        for (const extra of extraDocs) {
          await addPdf(await readFile(extra.file));
        }
        // 3+. Remaining static templates
        for (const t of templates.slice(1)) {
          await addPdf(await fetchTemplate(t.key), t.key);
        }
        // Autopay form
        if (autopay) {
          await addPdf(
            await fetchTemplate("Recurring CC form"),
            "Recurring CC form",
          );
        }
      }

      // Receipts always last
      await addPdf(await readFile(officeReceipt!));
      await addPdf(await readFile(ccReceipt!));

      const datePart = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}-${today.getFullYear()}`;
      const timePart = `${pad(today.getHours())}-${pad(today.getMinutes())}`;
      const safeName = customerName.trim().replace(/\s+/g, "_");
      const filename = `${safeName}_${policyType}_${datePart}_${timePart}.pdf`;

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
    setAutopay(true);
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

        {/* Policy Type Badges */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
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

          {/* Autopay toggle */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Autopay / Recurring CC Form
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {autopay
                  ? "Recurring CC Authorization will be included"
                  : "Recurring CC Authorization will be skipped"}
              </p>
            </div>
            <button
              onClick={() => setAutopay((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autopay ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autopay ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>
        </div>

        {/* Document Order Preview */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
            Final Document Order
            {!hasTemplates && (
              <span className="ml-2 text-xs font-normal text-amber-600 normal-case">
                — no templates configured for {policyType} yet
              </span>
            )}
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
              placeholder="e.g. Dawood Mustafa"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {customerName && (
              <p className="text-xs text-gray-500 mt-1">
                Filename preview:{" "}
                <span className="font-mono text-gray-700">
                  {customerName.trim().replace(/\s+/g, "_")}_{policyType}_
                  {datePreview}_HH-MM.pdf
                </span>
              </p>
            )}
          </div>

          {/* Company Application upload */}
          <FileUploadField
            label="Company Application / Policy Package"
            description="upload the original company PDF only"
            position="2"
            file={companyApp}
            inputRef={companyAppRef}
            onFileChange={setCompanyApp}
            required
          />

          {/* ── Extra Documents Section ── */}
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

            {/* Add extra doc button */}
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

          {/* Receipts */}
          <FileUploadField
            label="Office Receipt"
            description="The agency office receipt PDF from your system"
            position="10"
            file={officeReceipt}
            inputRef={officeReceiptRef}
            onFileChange={setOfficeReceipt}
            required
          />
          <FileUploadField
            label="Credit Card Receipt"
            description="The Square / terminal CC receipt PDF"
            position="11"
            file={ccReceipt}
            inputRef={ccReceiptRef}
            onFileChange={setCcReceipt}
            required
          />
        </div>

        {/* Status */}
        {status && (
          <div
            className={`rounded-xl p-4 mb-6 flex items-center gap-3 ${status.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
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
                Merging...
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
            Fill in customer name and upload all 3 required files to enable
            merge
          </p>
        )}
      </div>
    </div>
  );
}

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
