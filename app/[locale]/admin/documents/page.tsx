// app/[locale]/admin/documents/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  IdCard,
  Loader2,
  MapPin,
  Medal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import AdminShell from "../_components/AdminShell";

type TileKey =
  | "vehicle"
  | "license"
  | "pop"
  | "poh"
  | "membership"
  | "goodStudent"
  | "military"
  | "garaging"
  | "other";

const TILES: {
  key: TileKey;
  label: string;
  sub: string;
  icon: React.ElementType;
}[] = [
  {
    key: "vehicle",
    label: "Vehicle photos",
    sub: "4 sides + mileage + VIN",
    icon: Car,
  },
  {
    key: "license",
    label: "Driver's license / ID",
    sub: "One per driver",
    icon: IdCard,
  },
  {
    key: "pop",
    label: "Proof of prior (POP)",
    sub: "Prior insurance",
    icon: ShieldCheck,
  },
  {
    key: "poh",
    label: "Proof of homeownership",
    sub: "Mortgage, deed, tax bill",
    icon: Home,
  },
  {
    key: "membership",
    label: "Membership proof",
    sub: "Sam's Club / Costco",
    icon: BadgeCheck,
  },
  {
    key: "goodStudent",
    label: "Good student",
    sub: "Report card",
    icon: GraduationCap,
  },
  {
    key: "military",
    label: "Military",
    sub: "ID or proof of service",
    icon: Medal,
  },
  {
    key: "garaging",
    label: "Garaging proof",
    sub: "Proof of address",
    icon: MapPin,
  },
  { key: "other", label: "Something else", sub: "Describe it", icon: Plus },
];

const POP_PRESETS = [6, 12, 18, 24];

const REMINDER_PILLS = [
  { key: "reminder1", label: "1st" },
  { key: "reminder2", label: "2nd" },
  { key: "reminder3", label: "3rd" },
  { key: "lastCall", label: "Last" },
];

interface ListItem {
  id: string;
  label: string;
  uploaded: boolean;
}
interface RequestRow {
  id: string;
  link: string;
  customerName: string;
  customerPhone: string;
  language: "en" | "es";
  createdAt: string;
  createdBy: string | null;
  expiresAt: string;
  status: "open" | "received" | "closed";
  sentReminders: string[];
  allReceivedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  hasNew: boolean;
  items: ListItem[];
}
interface ViewFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  url: string;
  downloadUrl: string;
}
interface ViewItem {
  id: string;
  label: string;
  slots: { key: string; label: string; files: ViewFile[] }[];
}

const formatPhone = (p: string) => {
  const c = p.replace(/\D/g, "");
  if (c.length <= 3) return c;
  if (c.length <= 6) return `(${c.slice(0, 3)}) ${c.slice(3)}`;
  return `(${c.slice(0, 3)}) ${c.slice(3, 6)}-${c.slice(6, 10)}`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const inputCls =
  "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm";

// Outside the page component so typing doesn't remount the inputs (focus loss)
function ListEditor({
  values,
  setValues,
  placeholder,
  addLabel,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={v}
            onChange={(e) =>
              setValues(values.map((x, j) => (j === i ? e.target.value : x)))
            }
            placeholder={placeholder}
            className={inputCls}
          />
          {values.length > 1 && (
            <button
              type="button"
              onClick={() => setValues(values.filter((_, j) => j !== i))}
              className="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setValues([...values, ""])}
        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}

export default function DocumentsPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [agentName, setAgentName] = useState("");
  const [tab, setTab] = useState<"new" | "requests">("new");

  // ── Create form ───────────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [language, setLanguage] = useState<"en" | "es" | null>(null);
  const [selected, setSelected] = useState<Set<TileKey>>(new Set());
  const [vehicles, setVehicles] = useState<string[]>([""]);
  const [drivers, setDrivers] = useState(1);
  const [popMonths, setPopMonths] = useState<number | "custom" | null>(null);
  const [popCustom, setPopCustom] = useState("");
  const [students, setStudents] = useState<string[]>([""]);
  const [others, setOthers] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [copied, setCopied] = useState(false);
  // Set when the agent is adding documents to a link that's already been sent
  const [addTo, setAddTo] = useState<RequestRow | null>(null);
  // Result of a "Request more": was the text sent, and what was asked for
  const [addResult, setAddResult] = useState<{
    smsSent: boolean;
    labels: string[];
  } | null>(null);

  // ── Requests list ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [listStatus, setListStatus] = useState<
    "pending" | "uploaded" | "completed"
  >("uploaded");
  const [counts, setCounts] = useState({
    pending: 0,
    uploaded: 0,
    completed: 0,
  });
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  // ── Delete (password protected, like Guides) ──────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<RequestRow | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Viewer (daily code gated) ─────────────────────────────────────────────
  const codeRef = useRef<string>(""); // verified code, kept in memory for this page only
  const [codeFor, setCodeFor] = useState<RequestRow | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [viewing, setViewing] = useState<RequestRow | null>(null);
  const [viewItems, setViewItems] = useState<ViewItem[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  // Big in-page viewer: index into the flat list of every file in the request
  const [lightbox, setLightbox] = useState<number | null>(null);

  // ── Download all (one file at a time, remembered per file) ────────────────
  const [downloaded, setDownloaded] = useState<Set<string>>(() => {
    try {
      return new Set<string>(
        JSON.parse(localStorage.getItem("docs_downloaded") || "[]"),
      );
    } catch {
      return new Set<string>();
    }
  });
  const [dlProgress, setDlProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const saved = localStorage.getItem("admin_session");
      if (!saved) return void (window.location.href = "/admin");
      try {
        const s = JSON.parse(saved);
        if (Date.now() >= s.expiresAt) {
          localStorage.removeItem("admin_session");
          window.location.href = "/admin";
          return;
        }
        setAgentName(s.username || "");
        setIsCheckingAuth(false);
      } catch {
        localStorage.removeItem("admin_session");
        window.location.href = "/admin";
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  // ── List loading ──────────────────────────────────────────────────────────
  const searchRef = useRef(search);
  searchRef.current = search;

  const fetchList = useCallback(
    async (silent = false) => {
      if (!silent) setListLoading(true);
      try {
        const qs = new URLSearchParams({
          status: listStatus,
          search: searchRef.current.trim(),
        });
        const res = await fetch(`/api/document-requests?${qs}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.success) {
          setRows(data.requests);
          if (data.counts) setCounts(data.counts);
        }
      } catch (e) {
        console.error("Documents list error:", e);
      } finally {
        if (!silent) setListLoading(false);
      }
    },
    [listStatus],
  );

  // Runs on both tabs, so the Sent Links badge shows uploads waiting for review
  useEffect(() => {
    if (isCheckingAuth) return;
    fetchList();
    const id = setInterval(() => fetchList(true), 30000);
    return () => clearInterval(id);
  }, [isCheckingAuth, tab, fetchList]);

  useEffect(() => {
    if (isCheckingAuth || tab !== "requests") return;
    const id = setTimeout(() => fetchList(true), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Create ────────────────────────────────────────────────────────────────
  const toggleTile = (k: TileKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const popValue = popMonths === "custom" ? parseInt(popCustom, 10) : popMonths;
  const has = (k: TileKey) => selected.has(k);

  const tileProblems: string[] = [];
  if (has("vehicle") && !vehicles.some((v) => v.trim()))
    tileProblems.push("Enter at least one vehicle");
  if (has("pop") && !(popValue && popValue >= 1 && popValue <= 60))
    tileProblems.push("Pick POP months");
  if (has("goodStudent") && !students.some((s) => s.trim()))
    tileProblems.push("Enter the student's name");
  if (has("other") && !others.some((o) => o.trim()))
    tileProblems.push("Describe the other document");

  const canCreate =
    !!customerName.trim() &&
    customerPhone.length === 10 &&
    !!language &&
    selected.size > 0 &&
    tileProblems.length === 0;

  const translateToEs = async (text: string) => {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, to: "es" }),
      });
      const data = await res.json();
      return (data.translated as string) || text;
    } catch {
      return text;
    }
  };

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const specs: any[] = [];
      for (const t of TILES) {
        if (!has(t.key)) continue;
        switch (t.key) {
          case "vehicle":
            specs.push({
              type: "vehicle",
              vehicles: vehicles.map((v) => v.trim()).filter(Boolean),
            });
            break;
          case "license":
            specs.push({ type: "license", drivers });
            break;
          case "pop":
            specs.push({ type: "pop", months: popValue });
            break;
          case "goodStudent":
            specs.push({
              type: "goodStudent",
              students: students.map((s) => s.trim()).filter(Boolean),
            });
            break;
          case "other": {
            const labels = await Promise.all(
              others
                .map((o) => o.trim())
                .filter(Boolean)
                .map(async (en) => ({
                  en,
                  es: language === "es" ? await translateToEs(en) : en,
                })),
            );
            specs.push({ type: "other", labels });
            break;
          }
          default:
            specs.push({ type: t.key });
        }
      }

      const res = addTo
        ? await fetch(`/api/document-requests/${addTo.id}/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specs, by: agentName }),
          })
        : await fetch("/api/document-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerName: customerName.trim(),
              customerPhone,
              language,
              specs,
              createdBy: agentName,
            }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          data.error ||
            (addTo
              ? "Couldn't add the documents."
              : "Couldn't create the link."),
        );
      setCreatedLink(data.link || addTo?.link || "");
      if (addTo)
        setAddResult({
          smsSent: data.smsSent !== false,
          labels: Array.isArray(data.labels) ? data.labels : [],
        });
      setCopied(false);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setLanguage(null);
    setSelected(new Set());
    setVehicles([""]);
    setDrivers(1);
    setPopMonths(null);
    setPopCustom("");
    setStudents([""]);
    setOthers([""]);
    setCreatedLink("");
    setCreateError("");
    setCopied(false);
    setAddTo(null);
    setAddResult(null);
  };

  const startAddMore = (row: RequestRow) => {
    resetForm();
    setAddTo(row);
    setCustomerName(row.customerName);
    setCustomerPhone(row.customerPhone);
    setLanguage(row.language);
    setTab("new");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copy = async (text: string, rowId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (rowId) {
        setCopiedRowId(rowId);
        setTimeout(() => setCopiedRowId(null), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  // ── Viewer ────────────────────────────────────────────────────────────────
  const loadView = async (row: RequestRow, code: string) => {
    setViewLoading(true);
    try {
      const res = await fetch(`/api/document-requests/${row.id}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.status === 401) {
        codeRef.current = "";
        setViewing(null);
        setCodeFor(row);
        setCodeError("Invalid security code.");
        return;
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      codeRef.current = code;
      setViewItems(data.items);
      setViewing(row);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, hasNew: false } : r)),
      );
    } catch {
      alert("Couldn't load documents.");
    } finally {
      setViewLoading(false);
    }
  };

  const openViewer = (row: RequestRow) => {
    setLightbox(null);
    loadView(row, "");
  };

  // Every file in the request, in order, with a readable label
  const allViewFiles = viewItems.flatMap((item) =>
    item.slots.flatMap((slot) =>
      slot.files.map((f) => ({
        f,
        label:
          item.slots.length > 1 ? `${item.label} · ${slot.label}` : item.label,
      })),
    ),
  );
  const indexOfFile = (id: string) =>
    allViewFiles.findIndex((x) => x.f.id === id);

  // ← → to move, Esc to close
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight")
        setLightbox((i) =>
          i === null ? i : Math.min(allViewFiles.length - 1, i + 1),
        );
      if (e.key === "ArrowLeft")
        setLightbox((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, allViewFiles.length]);

  const markDownloaded = (id: string) =>
    setDownloaded((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          "docs_downloaded",
          JSON.stringify([...next].slice(-2000)),
        );
      } catch {}
      return next;
    });

  // Each download link is signed as an attachment, so the browser saves the
  // file instead of opening it. Chrome asks once to "allow multiple downloads".
  const downloadAll = async () => {
    if (!viewing || dlProgress) return;
    setDlProgress({ done: 0, total: 0 });
    try {
      // Fresh links: the ones on screen stop working after 15 minutes
      const res = await fetch(`/api/document-requests/${viewing.id}/view`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error("load");
      setViewItems(data.items);
      const files: ViewFile[] = (data.items as ViewItem[]).flatMap((i) =>
        i.slots.flatMap((s) => s.files),
      );
      for (let n = 0; n < files.length; n++) {
        setDlProgress({ done: n, total: files.length });
        const a = document.createElement("a");
        a.href = files[n].downloadUrl;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        markDownloaded(files[n].id);
        await new Promise((r) => setTimeout(r, 700)); // browsers drop back-to-back downloads
      }
    } catch {
      alert("Couldn't download the files. Try again.");
    } finally {
      setDlProgress(null);
    }
  };

  const submitCode = async () => {
    if (codeInput.length !== 4 || !codeFor) return;
    const row = codeFor;
    setCodeFor(null);
    (document.activeElement as HTMLElement)?.blur();
    await loadView(row, codeInput);
  };

  const reopen = async (row: RequestRow) => {
    if (
      !confirm(`Reopen the link for ${row.customerName} for another 10 days?`)
    )
      return;
    const res = await fetch(`/api/document-requests/${row.id}/reopen`, {
      method: "POST",
    });
    if (!res.ok) return alert("Couldn't reopen.");
    fetchList(true);
  };

  // Agent took care of it -> Completed (reminders stop). Undo puts it back.
  const markCompleted = async (row: RequestRow, undo = false) => {
    setCompletingId(row.id);
    try {
      const res = await fetch(`/api/document-requests/${row.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: agentName, undo }),
      });
      if (!res.ok) return alert("Couldn't update. Try again.");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      fetchList(true);
    } finally {
      setCompletingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteCode || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(
        `/api/document-requests/${deleteTarget.id}?code=${encodeURIComponent(deleteCode)}`,
        { method: "DELETE" },
      );
      if (res.status === 403) {
        setDeleteError("Incorrect code. Try again.");
        return;
      }
      if (!res.ok) {
        setDeleteError("Couldn't delete. Try again.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteCode("");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/documents">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <button
                onClick={() => (window.location.href = "/admin")}
                className="text-sm text-gray-500 hover:text-gray-800 mb-1"
              >
                ← Back to Admin
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
              <p className="text-gray-600 text-sm">
                Request documents from customers and review uploads
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm p-2 mb-6 grid grid-cols-2 gap-2">
            {(
              [
                ["new", "New Request", Plus],
                ["requests", "Sent Links", FolderOpen],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                  tab === k
                    ? "bg-gradient-to-r from-red-700 to-blue-800 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-5 h-5" /> {label}
                {k === "requests" && counts.uploaded > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                    {counts.uploaded} to review
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── NEW REQUEST ── */}
          {tab === "new" && !createdLink && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
              {addTo && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-amber-900">
                    <strong>Adding to {addTo.customerName}&apos;s link.</strong>{" "}
                    Pick what else you need. They&apos;ll get a text and can
                    upload it with the same link (
                    {Math.max(
                      0,
                      Math.ceil(
                        (new Date(addTo.expiresAt).getTime() - Date.now()) /
                          86400000,
                      ),
                    )}{" "}
                    days left).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setTab("requests");
                    }}
                    className="text-xs font-semibold text-amber-800 hover:text-amber-950 flex-shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${addTo ? "pointer-events-none opacity-60" : ""}`}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Maria Lopez"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formatPhone(customerPhone)}
                    maxLength={14}
                    onChange={(e) =>
                      setCustomerPhone(
                        e.target.value.replace(/\D/g, "").slice(0, 10),
                      )
                    }
                    placeholder="(555) 123-4567"
                    className={inputCls}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Reminders are texted to this number
                  </p>
                </div>
              </div>

              <div className={addTo ? "pointer-events-none opacity-60" : ""}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Language <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["en", "es"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLanguage(l)}
                      className={`p-3 rounded-lg border-2 font-medium transition ${
                        language === l
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-700 hover:border-gray-400"
                      }`}
                    >
                      {l === "en" ? "English" : "Español"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What&apos;s missing? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {TILES.map(({ key, label, sub, icon: Icon }) => {
                    const on = has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleTile(key)}
                        className={`relative aspect-square sm:aspect-[5/4] rounded-xl border-2 p-3 flex flex-col items-center justify-center text-center gap-1.5 transition ${
                          on
                            ? "border-blue-600 bg-blue-50 text-blue-800"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {on && (
                          <Check className="w-4 h-4 absolute top-2 right-2 text-blue-600" />
                        )}
                        <Icon
                          className={`w-7 h-7 ${on ? "text-blue-600" : "text-gray-400"}`}
                        />
                        <span className="text-sm font-semibold leading-tight">
                          {label}
                        </span>
                        <span className="text-[11px] opacity-70 leading-tight">
                          {sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-tile details */}
              {(has("vehicle") ||
                has("license") ||
                has("pop") ||
                has("goodStudent") ||
                has("other")) && (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  {has("vehicle") && (
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                        Which vehicles?
                      </p>
                      <ListEditor
                        values={vehicles}
                        setValues={setVehicles}
                        placeholder="e.g. 2015 Nissan Altima"
                        addLabel="Add vehicle"
                      />
                    </div>
                  )}
                  {has("license") && (
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                        How many drivers?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDrivers((d) => Math.max(1, d - 1))}
                          className="w-9 h-9 rounded-lg border border-gray-300 bg-white font-bold text-gray-600"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-bold text-lg">
                          {drivers}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDrivers((d) => Math.min(10, d + 1))}
                          className="w-9 h-9 rounded-lg border border-gray-300 bg-white font-bold text-gray-600"
                        >
                          +
                        </button>
                        <span className="text-xs text-gray-500 ml-2">
                          Customer picks the ID type (DL, state ID, passport,
                          consular…)
                        </span>
                      </div>
                    </div>
                  )}
                  {has("pop") && (
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                        Proof of prior: how many months?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {POP_PRESETS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPopMonths(m)}
                            className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                              popMonths === m
                                ? "border-blue-600 bg-blue-50 text-blue-700"
                                : "border-gray-300 bg-white text-gray-600"
                            }`}
                          >
                            {m} mo
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPopMonths("custom")}
                          className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                            popMonths === "custom"
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-300 bg-white text-gray-600"
                          }`}
                        >
                          Custom
                        </button>
                        {popMonths === "custom" && (
                          <input
                            value={popCustom}
                            onChange={(e) =>
                              setPopCustom(
                                e.target.value.replace(/\D/g, "").slice(0, 2),
                              )
                            }
                            placeholder="Months"
                            inputMode="numeric"
                            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {has("goodStudent") && (
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                        Good student: which driver?
                      </p>
                      <ListEditor
                        values={students}
                        setValues={setStudents}
                        placeholder="Student driver's name"
                        addLabel="Add another student"
                      />
                    </div>
                  )}
                  {has("other") && (
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                        What else do you need?
                      </p>
                      <ListEditor
                        values={others}
                        setValues={setOthers}
                        placeholder="e.g. Bill of sale"
                        addLabel="Add another"
                      />
                      {language === "es" && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          Type it in English, it&apos;s translated for the
                          customer.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {createError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {createError}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="w-full px-6 py-3 bg-gradient-to-r from-red-700 to-blue-800 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Creating link…
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-5 h-5" />{" "}
                    {addTo ? "Request These Documents" : "Create Document Link"}
                  </>
                )}
              </button>
              {!canCreate && tileProblems.length > 0 && (
                <p className="text-xs text-gray-400 text-center -mt-2">
                  {tileProblems[0]}
                </p>
              )}
            </div>
          )}

          {tab === "new" && createdLink && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Check className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-900">
                  {addTo
                    ? `Additional documents requested from ${customerName}`
                    : `Document link created for ${customerName}`}
                </h3>
              </div>
              {addTo && addResult && (
                <div
                  className={`text-sm rounded-lg border p-3 mb-4 ${
                    addResult.smsSent
                      ? "bg-white border-green-200 text-green-900"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  {addResult.smsSent ? (
                    <>
                      <strong>✓ Text already sent.</strong> {customerName} (
                      {formatPhone(customerPhone)}) was texted this link asking
                      for the additional documents. No need to send it again.
                    </>
                  ) : (
                    <>
                      <strong>The text didn&apos;t send.</strong> The documents
                      were added, so copy the link below and send it to the
                      customer yourself.
                    </>
                  )}
                  {addResult.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {addResult.labels.map((l) => (
                        <span
                          key={l}
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800"
                        >
                          + {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-800 break-all font-mono bg-white border border-green-200 p-3 rounded mb-4">
                {createdLink}
              </p>
              <button
                onClick={() => copy(createdLink)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" /> Copy Link
                  </>
                )}
              </button>
              <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                {addTo ? (
                  <>
                    <strong>Same link as before.</strong> The customer uploads
                    the new documents with it until{" "}
                    {new Date(addTo.expiresAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    . The request is back in Pending until they do.
                  </>
                ) : (
                  <>
                    <strong>Next:</strong> send this link to the customer by
                    text or email. The link stays open 10 days. If anything is
                    still missing, the customer gets reminder texts the next
                    morning, then on days 3, 6 and 9. The reminders stop once
                    everything is uploaded.
                  </>
                )}
              </p>
              <button
                onClick={resetForm}
                className="w-full mt-3 px-6 py-3 bg-white text-gray-600 rounded-lg font-medium border border-gray-200 hover:bg-gray-50"
              >
                {addTo ? "Done" : "Create another request"}
              </button>
            </div>
          )}

          {/* ── REQUESTS ── */}
          {tab === "requests" && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or phone…"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={() => fetchList()}
                  disabled={listLoading}
                  className="px-4 py-2.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-2"
                >
                  {listLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}{" "}
                  Refresh
                </button>
              </div>

              <div className="flex gap-1 mb-5 p-1 bg-gray-100 rounded-lg">
                {(
                  [
                    ["pending", "Pending"],
                    ["uploaded", "Uploaded"],
                    ["completed", "Completed"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setListStatus(k)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                      listStatus === k
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}{" "}
                    <span
                      className={
                        k === "uploaded" && counts.uploaded > 0
                          ? "ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white"
                          : "ml-1 text-gray-400 font-normal"
                      }
                    >
                      {counts[k]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 -mt-3 mb-4">
                {listStatus === "pending"
                  ? "Waiting on the customer to upload everything."
                  : listStatus === "uploaded"
                    ? "The customer uploaded everything. Review it, then mark it completed."
                    : "Taken care of by an agent."}
              </p>

              {listLoading && rows.length === 0 ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  {listStatus === "uploaded"
                    ? "Nothing waiting for review"
                    : "No requests here"}
                </div>
              ) : (
                <div className="space-y-3">
                  {rows.map((r) => {
                    const up = r.items.filter((i) => i.uploaded).length;
                    const daysLeft = Math.ceil(
                      (new Date(r.expiresAt).getTime() - Date.now()) / 86400000,
                    );
                    return (
                      <div
                        key={r.id}
                        className={`border rounded-lg p-4 ${r.hasNew ? "border-blue-400 bg-blue-50/40" : "border-gray-200"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900">
                                {r.customerName}
                              </h3>
                              {r.hasNew && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded animate-pulse">
                                  NEW UPLOAD
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                  r.completedAt
                                    ? "bg-emerald-100 text-emerald-700"
                                    : r.allReceivedAt
                                      ? "bg-blue-100 text-blue-700"
                                      : r.status === "closed"
                                        ? "bg-gray-200 text-gray-600"
                                        : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {r.completedAt
                                  ? "COMPLETED"
                                  : r.allReceivedAt
                                    ? "UPLOADED · NEEDS REVIEW"
                                    : r.status === "closed"
                                      ? "LINK CLOSED"
                                      : `PENDING · ${daysLeft}d left`}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatPhone(r.customerPhone)} ·{" "}
                              {r.language === "es" ? "Español" : "English"}
                            </p>
                            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" />{" "}
                              {fmtDate(r.createdAt)}
                              {r.createdBy ? ` · by ${r.createdBy}` : ""}
                            </p>
                            {r.completedAt && (
                              <p className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3" /> Completed{" "}
                                {fmtDate(r.completedAt)}
                                {r.completedBy ? ` by ${r.completedBy}` : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 flex-shrink-0">
                            <button
                              onClick={() => openViewer(r)}
                              disabled={up === 0 || viewLoading}
                              className="px-3 py-1.5 text-sm rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 flex items-center gap-1.5"
                            >
                              <FolderOpen className="w-4 h-4" /> View
                            </button>
                            <button
                              onClick={() => copy(r.link, r.id)}
                              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1.5"
                            >
                              {copiedRowId === r.id ? (
                                <>
                                  <Check className="w-4 h-4" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" /> Copy Link
                                </>
                              )}
                            </button>
                            {r.completedAt ? (
                              <button
                                onClick={() => markCompleted(r, true)}
                                disabled={completingId === r.id}
                                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                              >
                                Undo
                              </button>
                            ) : (
                              <button
                                onClick={() => markCompleted(r)}
                                disabled={completingId === r.id || up === 0}
                                title={
                                  up === 0
                                    ? "Nothing uploaded yet"
                                    : "Mark as taken care of"
                                }
                                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5"
                              >
                                {completingId === r.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}{" "}
                                Mark completed
                              </button>
                            )}
                            {new Date(r.expiresAt).getTime() > Date.now() && (
                              <button
                                onClick={() => startAddMore(r)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1.5"
                              >
                                <Plus className="w-4 h-4" /> Request more
                              </button>
                            )}
                            {r.status === "closed" && !r.completedAt && (
                              <button
                                onClick={() => reopen(r)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 flex items-center gap-1.5"
                              >
                                <RefreshCw className="w-4 h-4" /> Reopen 10 days
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setDeleteTarget(r);
                                setDeleteCode("");
                                setDeleteError("");
                              }}
                              title="Delete request"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mb-1">
                            <span>
                              {up} of {r.items.length} uploaded
                            </span>
                            {r.status === "open" && !r.completedAt && (
                              <span className="flex items-center gap-1">
                                Reminders:
                                {REMINDER_PILLS.map((p) => {
                                  const sent = r.sentReminders.includes(p.key);
                                  return (
                                    <span
                                      key={p.key}
                                      className={`px-1.5 py-0.5 rounded font-bold ${sent ? "bg-green-200 text-green-800" : "bg-gray-100 text-gray-400"}`}
                                    >
                                      {p.label}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{
                                width: `${(up / r.items.length) * 100}%`,
                              }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.items.map((i) => (
                              <span
                                key={i.id}
                                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                                  i.uploaded
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {i.uploaded && <Check className="w-3 h-3" />}
                                {i.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Delete Request
                </p>
                <p className="text-xs text-gray-400 line-clamp-1">
                  {deleteTarget.customerName} ·{" "}
                  {formatPhone(deleteTarget.customerPhone)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              This deletes the link and every uploaded file, and stops the
              reminders. Enter the admin delete code to confirm. This cannot be
              undone.
            </p>
            <input
              type="password"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition placeholder-gray-300 mb-2"
              placeholder="Enter delete code"
              value={deleteCode}
              onChange={(e) => {
                setDeleteCode(e.target.value);
                setDeleteError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
              autoFocus
            />
            {deleteError && (
              <p className="text-xs text-rose-600 mb-2">{deleteError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!deleteCode || deleting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security code prompt */}
      {codeFor && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-slate-900 p-6 text-white text-center">
              <Shield className="w-10 h-10 mx-auto mb-2 text-amber-400" />
              <h3 className="text-lg font-bold">Security Verification</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter today&apos;s code to view customer documents
              </p>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="password"
                inputMode="numeric"
                value={codeInput}
                autoFocus
                maxLength={4}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                onChange={(e) => {
                  setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setCodeError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
                placeholder="• • • •"
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
              />
              {codeError && (
                <p className="text-sm text-red-600 text-center">{codeError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setCodeFor(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCode}
                  disabled={codeInput.length !== 4}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black disabled:opacity-40"
                >
                  Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Viewer */}
      {viewing && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {viewing.customerName}
                </h3>
                <p className="text-xs text-gray-500">
                  {formatPhone(viewing.customerPhone)} · links expire in 15 min
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const all = viewItems.flatMap((i) =>
                    i.slots.flatMap((s) => s.files),
                  );
                  const allDone =
                    all.length > 0 && all.every((f) => downloaded.has(f.id));
                  return (
                    <button
                      onClick={downloadAll}
                      disabled={!!dlProgress || all.length === 0}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg disabled:opacity-60 ${
                        allDone && !dlProgress
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-gradient-to-r from-red-700 to-blue-800 text-white hover:opacity-90"
                      }`}
                    >
                      {dlProgress ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : allDone ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {dlProgress
                        ? `Downloading ${Math.min(dlProgress.done + 1, dlProgress.total || 1)} of ${dlProgress.total || "…"}`
                        : allDone
                          ? "All downloaded"
                          : `Download all (${all.length})`}
                    </button>
                  );
                })()}
                <button
                  onClick={() => loadView(viewing, codeRef.current)}
                  disabled={viewLoading}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${viewLoading ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  onClick={() => {
                    setLightbox(null);
                    setViewing(null);
                  }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {viewItems.map((item) => {
                const anyFiles = item.slots.some((s) => s.files.length);
                return (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">
                          {item.label}
                        </p>
                        {!anyFiles && (
                          <p className="text-[11px] text-gray-400">
                            Not uploaded yet
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {item.slots.map((slot) =>
                        slot.files.length === 0 ? (
                          <div
                            key={slot.key}
                            className="aspect-[4/3] rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center p-2"
                          >
                            <p className="text-[11px] font-semibold text-gray-400">
                              {slot.label}
                            </p>
                            <p className="text-[10px] text-gray-300">missing</p>
                          </div>
                        ) : (
                          slot.files.map((f) => (
                            <button
                              type="button"
                              key={f.id}
                              onClick={() => setLightbox(indexOfFile(f.id))}
                              className="group block text-left rounded-lg border border-gray-200 overflow-hidden hover:border-blue-400 hover:shadow-md transition"
                            >
                              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center relative overflow-hidden">
                                {f.contentType.startsWith("image/") ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={f.url}
                                    alt={slot.label}
                                    className="w-full h-full object-contain bg-gray-100"
                                    loading="lazy"
                                  />
                                ) : f.contentType === "application/pdf" ? (
                                  // Live first-page preview; clicks go to the button
                                  <iframe
                                    src={`${f.url}#toolbar=0&navpanes=0&view=FitH`}
                                    title={f.name}
                                    loading="lazy"
                                    className="w-full h-full pointer-events-none bg-white"
                                  />
                                ) : (
                                  <FileText className="w-10 h-10 text-gray-400" />
                                )}
                                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition">
                                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold px-2.5 py-1 rounded-full bg-black/60 transition">
                                    View larger
                                  </span>
                                </span>
                                {downloaded.has(f.id) && (
                                  <span className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shadow">
                                    <Check className="w-3 h-3" /> Downloaded
                                  </span>
                                )}
                              </div>
                              <div className="px-2 py-1.5">
                                <p className="text-[11px] font-semibold text-gray-700 truncate">
                                  {item.slots.length > 1 ? slot.label : f.name}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  {fmtDate(f.uploadedAt)}
                                </p>
                              </div>
                            </button>
                          ))
                        ),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Big in-page viewer */}
      {viewing &&
        lightbox !== null &&
        allViewFiles[lightbox] &&
        (() => {
          const { f, label } = allViewFiles[lightbox];
          const isImg = f.contentType.startsWith("image/");
          return (
            <div
              className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
              onClick={() => setLightbox(null)}
            >
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{label}</p>
                  <p className="text-[11px] text-white/60 truncate">
                    {f.name} · {fmtDate(f.uploadedAt)} · {lightbox + 1} of{" "}
                    {allViewFiles.length}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={f.downloadUrl}
                    onClick={() => markDownloaded(f.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20"
                  >
                    <ExternalLink className="w-4 h-4" /> New tab
                  </a>
                  <button
                    onClick={() => setLightbox(null)}
                    className="p-2 rounded-lg hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 min-h-0 flex items-center justify-center px-14 pb-4">
                {lightbox > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightbox(lightbox - 1);
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}
                <div
                  className="w-full h-full flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f.id}
                      src={f.url}
                      alt={label}
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  ) : (
                    <iframe
                      key={f.id}
                      src={`${f.url}#view=FitH`}
                      title={f.name}
                      className="w-full h-full max-w-5xl bg-white rounded"
                    />
                  )}
                </div>
                {lightbox < allViewFiles.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightbox(lightbox + 1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          );
        })()}
    </AdminShell>
  );
}
