// app/[locale]/admin/unsold-quotes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Phone,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import AdminShell from "../_components/AdminShell";
import CodeGate from "../_components/CodeGate";

type Status = "pending" | "contacted" | "sold" | "lost" | "existing_customer";
type Tab = "open" | "sold" | "lost" | "existing_customer";

interface Note {
  text: string;
  by?: string;
  at: string;
}

interface Quote {
  phone: string;
  first_name: string;
  last_name: string;
  status: Status;
  first_quoted_at: string;
  last_quoted_at: string;
  computer?: string;
  sold_at?: string;
  sold_by?: string;
  sold_policy?: string | null;
  last_contacted_at?: string;
  notes?: Note[];
  agent?: string;
  quoted_by?: string | null;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Needs follow-up" },
  { key: "sold", label: "Sold" },
  { key: "lost", label: "Lost" },
  { key: "existing_customer", label: "Existing customers" },
];

const SOLD_BY: Record<string, string> = {
  receipt: "Receipt",
  idcard: "ID card",
  declaration: "Dec page",
  complete: "Dec page",
  coi: "COI",
  signwell: "SignWell",
  "policy on file": "Policy on file",
  manual: "Marked by agent",
};

const STATUS_PILL: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800",
  contacted: "bg-blue-100 text-blue-800",
  sold: "bg-green-100 text-green-800",
  lost: "bg-gray-200 text-gray-600",
  existing_customer: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Not contacted",
  contacted: "Contacted",
  sold: "Sold",
  lost: "Lost",
  existing_customer: "Existing customer",
};

function fmtPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : p;
}

function ago(iso?: string) {
  if (!iso) return "";
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export default function UnsoldQuotesPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>("open");
  const [search, setSearch] = useState("");
  const [agent, setAgent] = useState("");
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingPhone, setSavingPhone] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("admin_session");
    if (!saved) {
      window.location.href = "/admin";
      return;
    }
    try {
      const session = JSON.parse(saved);
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
    // Reuse the agent name the Messages page stores for today
    try {
      const raw = localStorage.getItem("agent_name");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name && Date.now() < parsed.expiresAt)
          setAgent(parsed.name);
      }
    } catch {}
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/unsold-quotes?days=${days}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't load quotes");
      setQuotes(data.quotes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load quotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isCheckingAuth) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckingAuth, days]);

  const update = async (q: Quote, body: { status?: Status; note?: string }) => {
    if (!agent.trim()) {
      setError("Enter your name at the top first.");
      return false;
    }
    setSavingPhone(q.phone);
    setError("");
    try {
      const res = await fetch("/api/unsold-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: q.phone, by: agent.trim(), ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't save");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      return false;
    } finally {
      setSavingPhone(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      pending: 0,
      contacted: 0,
      sold: 0,
      lost: 0,
      existing_customer: 0,
    };
    quotes.forEach((q) => (c[q.status] = (c[q.status] || 0) + 1));
    return c;
  }, [quotes]);

  const leads = counts.pending + counts.contacted + counts.sold + counts.lost;
  const closeRate = leads ? Math.round((counts.sold / leads) * 100) : 0;
  const overdue = quotes.filter(
    (q) =>
      q.status === "pending" &&
      Date.now() - new Date(q.first_quoted_at).getTime() > 24 * 3600 * 1000,
  ).length;

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return quotes
      .filter((q) =>
        tab === "open"
          ? q.status === "pending" || q.status === "contacted"
          : q.status === tab,
      )
      .filter(
        (q) =>
          !s ||
          `${q.first_name} ${q.last_name} ${q.quoted_by || ""} ${q.agent || ""}`
            .toLowerCase()
            .includes(s) ||
          (digits.length >= 3 && q.phone.includes(digits)),
      )
      .sort((a, b) => {
        if (tab === "open" && a.status !== b.status)
          return a.status === "pending" ? -1 : 1;
        return b.last_quoted_at.localeCompare(a.last_quoted_at);
      });
  }, [quotes, tab, search]);

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/unsold-quotes">
      <CodeGate
        title="Unsold Quotes"
        subtitle="Enter the super admin password"
        storageKey="unsold_quotes_unlocked_at"
      >
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => (window.location.href = "/admin/super-admin")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Super Admin
            </button>

            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Unsold Quotes
                </h1>
                <p className="text-sm text-gray-500">
                  Quotes from TurboRater. Sold ones close on their own when a
                  receipt, ID card, dec page or SignWell comes through.
                </p>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 flex-shrink-0"
                title="Refresh"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            {/* Figures */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                {
                  label: "Needs follow-up",
                  value: counts.pending + counts.contacted,
                  cls: "text-amber-700",
                },
                {
                  label: "Not called in 24h+",
                  value: overdue,
                  cls: overdue ? "text-red-600" : "text-gray-900",
                },
                { label: "Sold", value: counts.sold, cls: "text-green-700" },
                {
                  label: "Close rate",
                  value: `${closeRate}%`,
                  cls: "text-gray-900",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white border border-gray-100 rounded-2xl p-4"
                >
                  <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone or agent"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none"
                  />
                </div>
                <input
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  placeholder="Your name"
                  className="sm:w-40 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none"
                />
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="sm:w-36 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                </select>
              </div>
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {TABS.map((t) => {
                  const n =
                    t.key === "open"
                      ? counts.pending + counts.contacted
                      : counts[t.key];
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-md transition ${
                        tab === t.key
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t.label}{" "}
                      <span className="text-gray-400 font-normal">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-4">
                {error}
              </p>
            )}

            {/* List */}
            {loading && !quotes.length ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : shown.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">
                  Nothing here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((q) => {
                  const isOpen = openPhone === q.phone;
                  const saving = savingPhone === q.phone;
                  const ageMs =
                    Date.now() - new Date(q.first_quoted_at).getTime();
                  const edge =
                    q.status !== "pending"
                      ? "border-l-gray-200"
                      : ageMs > 3 * 86400000
                        ? "border-l-red-500"
                        : ageMs > 86400000
                          ? "border-l-orange-400"
                          : "border-l-amber-300";
                  return (
                    <div
                      key={q.phone}
                      className={`bg-white border border-gray-100 border-l-4 ${edge} rounded-xl`}
                    >
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">
                              {q.first_name} {q.last_name}
                            </p>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[q.status]}`}
                            >
                              {STATUS_LABEL[q.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm">
                            <a
                              href={`tel:${q.phone}`}
                              className="flex items-center gap-1 text-blue-700 hover:underline"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {fmtPhone(q.phone)}
                            </a>
                            <button
                              onClick={async () => {
                                await navigator.clipboard.writeText(q.phone);
                                setCopied(q.phone);
                                setTimeout(() => setCopied(null), 1500);
                              }}
                              className="text-gray-400 hover:text-gray-700"
                              title="Copy phone"
                            >
                              {copied === q.phone ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Quoted {ago(q.first_quoted_at)}
                            {(q.quoted_by || q.agent) &&
                              ` by ${q.quoted_by || q.agent}`}
                            {q.last_quoted_at !== q.first_quoted_at &&
                              ` · last opened ${ago(q.last_quoted_at)}`}
                            {q.computer && ` · ${q.computer}`}
                            {q.last_contacted_at &&
                              ` · contacted ${ago(q.last_contacted_at)}`}
                          </p>
                          {q.status === "sold" && (
                            <p className="text-xs text-green-700 mt-1">
                              Sold via{" "}
                              {SOLD_BY[q.sold_by || ""] || q.sold_by || "—"}
                              {q.sold_policy && ` · ${q.sold_policy}`}
                              {q.sold_at && ` · ${fmtDate(q.sold_at)}`}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {saving && (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          )}
                          {q.status === "pending" && (
                            <button
                              disabled={saving}
                              onClick={() => update(q, { status: "contacted" })}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                            >
                              Contacted
                            </button>
                          )}
                          {(q.status === "pending" ||
                            q.status === "contacted") && (
                            <>
                              <button
                                disabled={saving}
                                onClick={() => update(q, { status: "sold" })}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                              >
                                Sold
                              </button>
                              <button
                                disabled={saving}
                                onClick={() =>
                                  confirm(
                                    `Mark ${q.first_name} ${q.last_name} as lost?`,
                                  ) && update(q, { status: "lost" })
                                }
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                              >
                                Lost
                              </button>
                            </>
                          )}
                          {(q.status === "sold" || q.status === "lost") && (
                            <button
                              disabled={saving}
                              onClick={() => update(q, { status: "pending" })}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100"
                            >
                              Reopen
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setOpenPhone(isOpen ? null : q.phone);
                              setNoteText("");
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-gray-500 hover:bg-gray-100 flex items-center gap-1"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            Notes{q.notes?.length ? ` (${q.notes.length})` : ""}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-xl">
                          {q.notes?.length ? (
                            <div className="space-y-1.5 mb-3">
                              {[...q.notes].reverse().map((n, i) => (
                                <div key={i} className="text-xs">
                                  <span className="text-gray-800">
                                    {n.text}
                                  </span>
                                  <span className="text-gray-400">
                                    {" "}
                                    — {n.by || "?"}, {fmtDate(n.at)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 mb-3">
                              No notes yet.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <input
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              onKeyDown={async (e) => {
                                if (
                                  e.key === "Enter" &&
                                  noteText.trim() &&
                                  !saving
                                ) {
                                  if (
                                    await update(q, { note: noteText.trim() })
                                  )
                                    setNoteText("");
                                }
                              }}
                              placeholder="e.g. Left voicemail, call back Friday"
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-400 outline-none"
                            />
                            <button
                              disabled={!noteText.trim() || saving}
                              onClick={async () => {
                                if (await update(q, { note: noteText.trim() }))
                                  setNoteText("");
                              }}
                              className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-black disabled:opacity-40"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CodeGate>
    </AdminShell>
  );
}
