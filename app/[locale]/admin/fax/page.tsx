// app/admin/fax/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  Printer,
  Loader2,
  Shield,
  Search,
  X,
  Download,
  Paperclip,
  Send,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  Check,
  Clock,
  RefreshCw,
  Reply,
  ChevronDown,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import AdminShell from "../_components/AdminShell";

// RingCentral caps a single fax send; anything larger is rejected outright.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ACCEPTED = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.txt";

type Direction = "Inbound" | "Outbound";
type FaxStatus =
  | "Received"
  | "Queued"
  | "Sending"
  | "Sent"
  | "Delivered"
  | "SendingFailed"
  | "DeliveryFailed";

interface FaxAttachment {
  id?: string;
  filename?: string;
  contentType?: string;
  azureUrl?: string;
  pageCount?: number;
}

interface FaxRecord {
  _id: string;
  id: string; // fax_<rcId>
  direction: Direction;
  status: FaxStatus;
  from: string;
  to: string[];
  creationTime: string;
  pageCount: number;
  readStatus: "Read" | "Unread";
  coverPageText?: string;
  attachments: FaxAttachment[];
  errorMessage?: string;
  contactName?: string; // resolved later from customer/carrier records
}

// ── Mock data — replaced by /api/faxes once the sync is live ────────────────
const MOCK_FAXES: FaxRecord[] = [
  {
    _id: "1",
    id: "fax_1001",
    direction: "Inbound",
    status: "Received",
    from: "+18553717310",
    to: ["+14697541187"],
    creationTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    pageCount: 3,
    readStatus: "Unread",
    attachments: [
      {
        id: "a1",
        filename: "policy_APS-909549.pdf",
        contentType: "application/pdf",
        azureUrl: "",
        pageCount: 3,
      },
    ],
    contactName: "Home State County Mutual",
  },
  {
    _id: "2",
    id: "fax_1002",
    direction: "Outbound",
    status: "Delivered",
    from: "+14697541187",
    to: ["+12145551234"],
    creationTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    pageCount: 2,
    readStatus: "Read",
    coverPageText: "Signed application attached. Please confirm receipt.",
    attachments: [
      {
        id: "a2",
        filename: "signed_application.pdf",
        contentType: "application/pdf",
        azureUrl: "",
        pageCount: 2,
      },
    ],
  },
  {
    _id: "3",
    id: "fax_1003",
    direction: "Inbound",
    status: "Received",
    from: "+19726328364",
    to: ["+14697541187"],
    creationTime: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    pageCount: 1,
    readStatus: "Read",
    attachments: [
      {
        id: "a3",
        filename: "drivers_license.pdf",
        contentType: "application/pdf",
        azureUrl: "",
        pageCount: 1,
      },
    ],
    contactName: "Shahnawaz Mohammad",
  },
  {
    _id: "4",
    id: "fax_1004",
    direction: "Outbound",
    status: "SendingFailed",
    from: "+14697541187",
    to: ["+18005559999"],
    creationTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    pageCount: 5,
    readStatus: "Read",
    attachments: [
      {
        id: "a4",
        filename: "claim_packet.pdf",
        contentType: "application/pdf",
        azureUrl: "",
        pageCount: 5,
      },
    ],
    errorMessage: "No answer at destination after 3 attempts",
  },
];

export default function AdminFaxPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Inbox
  const [faxes, setFaxes] = useState<FaxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [serverUnread, setServerUnread] = useState(0);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // Responses can land out of order while typing — only the newest wins.
  const fetchSeqRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  // Compose
  const [showCompose, setShowCompose] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [coverText, setCoverText] = useState("");
  const [includeCover, setIncludeCover] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = () => {
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
    };
    checkAuth();
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Load faxes ───────────────────────────────────────────────────────────
  const fetchFaxes = useCallback(
    async (direction: string, search: string, quiet = false) => {
      const seq = ++fetchSeqRef.current;
      if (!quiet) setLoading(true);
      try {
        const params = new URLSearchParams({ direction, limit: "50" });
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`/api/fax?${params}`);
        const data = await res.json();
        if (seq !== fetchSeqRef.current) return; // superseded
        if (data.success) {
          setFaxes(data.faxes || []);
          setServerUnread(data.unread || 0);
        }
      } catch (err) {
        console.error("Failed to load faxes:", err);
      } finally {
        if (seq === fetchSeqRef.current) setLoading(false);
      }
    },
    [],
  );

  // Filter changes fetch immediately; typing is debounced.
  useEffect(() => {
    if (isCheckingAuth) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery.trim()) {
      fetchFaxes(filter, "");
      return;
    }
    searchDebounceRef.current = setTimeout(
      () => fetchFaxes(filter, searchQuery),
      300,
    );
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [isCheckingAuth, filter, searchQuery, fetchFaxes]);

  // Live updates — a new inbound fax, or an outbound one moving
  // Queued → Delivered, refreshes the list without a poll.
  useEffect(() => {
    if (isCheckingAuth || !process.env.NEXT_PUBLIC_SOCKET_URL) return;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => socket.emit("join-fax-admin-room"));
    // `quiet` so the list doesn't flash a spinner on every status tick
    socket.on("newFax", () => fetchFaxes(filter, searchQuery, true));
    socket.on("faxUpdated", () => fetchFaxes(filter, searchQuery, true));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckingAuth]);

  // RC only queues a fax on send — delivery lands minutes later. Poll any
  // non-terminal outbound fax so staff aren't staring at "Sending" with no
  // idea whether it worked.
  //
  // Keyed on a sorted id string rather than `faxes` itself: the array gets a
  // new identity on every refetch, and depending on it would tear down and
  // rebuild this interval constantly, firing an immediate RC call each time.
  const pendingFaxKey = faxes
    .filter(
      (f) =>
        f.direction === "Outbound" &&
        (f.status === "Queued" ||
          f.status === "Sending" ||
          f.status === "Sent"),
    )
    .map((f) => f.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!pendingFaxKey) return;
    const pendingIds = pendingFaxKey.split(",").slice(0, 1);
    let cancelled = false;
    let consecutive429 = 0;

    const tick = async () => {
      // After three straight rate limits, stop entirely. Railway's syncFaxes
      // updates status every 2 minutes regardless — this poller is only a
      // convenience, and it is not worth blocking the send path for.
      if (consecutive429 >= 3) return;
      for (const faxId of pendingIds) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/fax/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ faxId }),
          });
          if (res.status === 429) {
            consecutive429++;
            return;
          }
          consecutive429 = 0;
          const data = await res.json();
          if (cancelled || !data.success) continue;
          setFaxes((prev) =>
            prev.map((f) =>
              f.id === faxId && f.status !== data.status
                ? { ...f, status: data.status, errorMessage: data.errorMessage }
                : f,
            ),
          );
        } catch {
          /* next tick retries */
        }
      }
    };

    // 45s, and only the two oldest pending faxes per tick. syncFaxes on
    // Railway covers the rest every 2 minutes — this is just for the fax
    // the agent is watching right now.
    const id = setInterval(tick, 60000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pendingFaxKey]);

  const formatPhoneDisplay = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const selected = faxes.find((f) => f._id === selectedId) || null;

  // The API already applied the direction filter and search.
  const visibleFaxes = faxes;
  const unreadCount = serverUnread;

  const openFax = (fax: FaxRecord) => {
    setSelectedId(fax._id);
    if (fax.readStatus !== "Unread") return;

    // Optimistic — the badge clears instantly, the write follows.
    setFaxes((prev) =>
      prev.map((f) => (f._id === fax._id ? { ...f, readStatus: "Read" } : f)),
    );
    setServerUnread((n) => Math.max(0, n - 1));

    fetch("/api/fax/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faxId: fax.id }),
    }).catch(() => {
      /* next fetch corrects it */
    });
  };

  const addFiles = (incoming: File[]) => {
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_SIZE) {
        alert(
          `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)}MB — the limit is 20MB per fax.`,
        );
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
  };

  const totalSize = files.reduce((n, f) => n + f.size, 0);

  const canSend =
    recipient.replace(/\D/g, "").length >= 10 && files.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError("");
    setSendSuccess(false);
    try {
      const fd = new FormData();
      fd.append("to", recipient);
      if (includeCover && coverText.trim()) {
        fd.append("coverPageText", coverText.trim());
      }
      files.forEach((f) => fd.append("files", f));

      const res = await fetch("/api/fax/send", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Send failed");
      }

      setSendSuccess(true);
      setRecipient("");
      setCoverText("");
      setFiles([]);
      fetchFaxes(filter, searchQuery, true);
      setTimeout(() => setSendSuccess(false), 4000);
    } catch (err) {
      const e = err as { message?: string };
      setSendError(e.message || "Failed to send fax. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (fax: FaxRecord) => {
    const failed =
      fax.status === "SendingFailed" || fax.status === "DeliveryFailed";
    const pending = fax.status === "Queued" || fax.status === "Sending";
    if (failed)
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
          <AlertCircle className="w-2.5 h-2.5" /> Failed
        </span>
      );
    if (pending)
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
          <Clock className="w-2.5 h-2.5" /> Sending
        </span>
      );
    if (fax.status === "Sent")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          <Check className="w-2.5 h-2.5" /> Sent
        </span>
      );
    if (fax.direction === "Outbound")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
          <Check className="w-2.5 h-2.5" /> Delivered
        </span>
      );
    return null;
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-cyan-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-red-700 to-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm text-gray-500">Checking authentication…</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/fax">
      <div className="h-screen flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <button
                onClick={() => (window.location.href = "/admin")}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
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
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                Fax
              </h1>
            </div>
          </div>
          <Image
            src="/logo.png"
            alt="Texas Premium Insurance Services"
            width={160}
            height={50}
            className="h-12 w-auto object-contain hidden lg:block"
          />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none">
                Fax line
              </p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">
                (469) 754-1187
              </p>
            </div>
            <button
              onClick={() => setShowCompose((v) => !v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                showCompose
                  ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  : "bg-gradient-to-r from-red-700 to-blue-800 text-white hover:opacity-90"
              }`}
            >
              <Send className="w-4 h-4" />
              {showCompose ? "Hide compose" : "New fax"}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── INBOX ───────────────────────────────────────────────────── */}
          <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search number, name, or file…"
                  className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "inbound", label: "Received" },
                    { key: "outbound", label: "Sent" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition ${
                      filter === key
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {visibleFaxes.length} fax
                  {visibleFaxes.length !== 1 ? "es" : ""}
                  {unreadCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </span>
                <button
                  onClick={() => fetchFaxes(filter, searchQuery)}
                  disabled={loading}
                  className="p-1 text-gray-400 hover:text-gray-600 transition"
                  title="Refresh"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {visibleFaxes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
                  <Printer className="w-10 h-10 mb-2 text-gray-200" />
                  <p className="text-xs font-medium">No faxes</p>
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    {searchQuery
                      ? "Try a different search"
                      : "Nothing here yet"}
                  </p>
                </div>
              ) : (
                visibleFaxes.map((fax) => {
                  const isSelected = selectedId === fax._id;
                  const isUnread =
                    fax.direction === "Inbound" && fax.readStatus === "Unread";
                  const party =
                    fax.direction === "Inbound" ? fax.from : fax.to[0];
                  const failed =
                    fax.status === "SendingFailed" ||
                    fax.status === "DeliveryFailed";

                  return (
                    <button
                      key={fax._id}
                      onClick={() => openFax(fax)}
                      className={`w-full text-left px-3 py-3 border-b border-gray-50 transition ${
                        isSelected
                          ? "bg-cyan-50 border-l-4 border-l-cyan-600"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            failed
                              ? "bg-red-100 text-red-600"
                              : fax.direction === "Inbound"
                                ? "bg-cyan-100 text-cyan-700"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {fax.direction === "Inbound" ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`text-xs truncate ${
                                isUnread
                                  ? "font-bold text-gray-900"
                                  : "font-medium text-gray-700"
                              }`}
                            >
                              {fax.contactName || formatPhoneDisplay(party)}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] text-gray-400">
                                {formatWhen(fax.creationTime)}
                              </span>
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                              )}
                            </div>
                          </div>

                          {fax.contactName && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {formatPhoneDisplay(party)}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                              <FileText className="w-2.5 h-2.5" />
                              {fax.pageCount} pg
                            </span>
                            {statusBadge(fax)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── VIEWER ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col bg-gray-100">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                <Printer className="w-16 h-16 mb-3" />
                <p className="text-sm font-medium text-gray-400">
                  Select a fax to view
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between flex-shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-900 truncate">
                        {selected.contactName ||
                          formatPhoneDisplay(
                            selected.direction === "Inbound"
                              ? selected.from
                              : selected.to[0],
                          )}
                      </h2>
                      {statusBadge(selected)}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {selected.direction === "Inbound" ? "From" : "To"}{" "}
                      {formatPhoneDisplay(
                        selected.direction === "Inbound"
                          ? selected.from
                          : selected.to[0],
                      )}{" "}
                      · {selected.pageCount} page
                      {selected.pageCount !== 1 ? "s" : ""} ·{" "}
                      {new Date(selected.creationTime).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selected.direction === "Inbound" && (
                      <button
                        onClick={() => {
                          setRecipient(selected.from);
                          setShowCompose(true);
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-100 text-cyan-700 hover:bg-cyan-200 transition flex items-center gap-1.5"
                      >
                        <Reply className="w-3.5 h-3.5" /> Fax back
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const url = selected.attachments[0]?.azureUrl;
                        if (url) window.open(url, "_blank");
                      }}
                      disabled={!selected.attachments[0]?.azureUrl}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-1.5 disabled:opacity-40"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>

                {selected.errorMessage && (
                  <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      {selected.errorMessage}
                    </p>
                  </div>
                )}

                {selected.coverPageText && (
                  <div className="mx-5 mt-3 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      Cover page
                    </p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">
                      {selected.coverPageText}
                    </p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-5">
                  {selected.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4"
                    >
                      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 truncate flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          {att.filename}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {att.pageCount} pg
                        </span>
                      </div>
                      {att.azureUrl ? (
                        <iframe
                          src={att.azureUrl}
                          className="w-full h-[70vh] bg-gray-50"
                          title={att.filename}
                        />
                      ) : (
                        <div className="h-[50vh] flex flex-col items-center justify-center bg-gray-50 text-gray-300">
                          <FileText className="w-12 h-12 mb-2" />
                          <p className="text-xs text-gray-400">
                            PDF preview appears here
                          </p>
                          <p className="text-[10px] text-gray-300 mt-0.5">
                            The document didn&apos;t copy to storage — check the
                            sync logs
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── COMPOSE ─────────────────────────────────────────────────── */}
          {showCompose && (
            <div className="w-96 flex-shrink-0 bg-white border-l border-gray-100 flex flex-col">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-semibold text-gray-900">
                  Send a fax
                </h2>
                <button
                  onClick={() => setShowCompose(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {sendSuccess && (
                  <div className="px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-green-800">
                        Fax queued
                      </p>
                      <p className="text-[11px] text-green-700 mt-0.5">
                        Delivery usually confirms within a few minutes.
                      </p>
                    </div>
                  </div>
                )}

                {sendError && (
                  <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{sendError}</p>
                  </div>
                )}

                {/* Recipient */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Fax to <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formatPhoneDisplay(recipient)}
                    onChange={(e) =>
                      setRecipient(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="(555) 123-4567"
                    maxLength={14}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                  />
                </div>

                {/* Cover page */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setIncludeCover((v) => !v)}
                      role="switch"
                      aria-checked={includeCover}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                        includeCover ? "bg-cyan-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          includeCover ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                    <label className="text-xs font-medium text-gray-700">
                      Include cover page
                    </label>
                  </div>
                  {includeCover && (
                    <textarea
                      value={coverText}
                      onChange={(e) => setCoverText(e.target.value)}
                      rows={3}
                      placeholder="Note for the cover page — e.g. policy number, what's attached, callback number…"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none resize-none"
                    />
                  )}
                </div>

                {/* Documents */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Documents <span className="text-red-500">*</span>
                  </label>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg py-6 hover:border-cyan-300 hover:bg-cyan-50/40 transition flex flex-col items-center gap-1.5"
                  >
                    <Paperclip className="w-5 h-5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-600">
                      Choose files
                    </span>
                    <span className="text-[10px] text-gray-400">
                      PDF, Word, or images · 20MB max
                    </span>
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files || []));
                      e.target.value = "";
                    }}
                  />

                  {files.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {files.map((f, i) => (
                        <div
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 border border-gray-100 rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-700 truncate">
                              {f.name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {(f.size / 1024 / 1024).toFixed(2)}MB
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setFiles((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="text-gray-300 hover:text-red-500 transition flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-gray-400 text-right pt-0.5">
                        {files.length} file{files.length !== 1 ? "s" : ""} ·{" "}
                        {(totalSize / 1024 / 1024).toFixed(2)}MB total
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                  Documents are sent in the order listed above. Faxes are
                  delivered from (469) 754-1187 and may take several minutes to
                  confirm.
                </p>
              </div>

              <div className="p-4 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 bg-gradient-to-r from-red-700 to-blue-800 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Send fax
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
