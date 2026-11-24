// app/[locale]/admin/due-reminders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import AdminShell from "../_components/AdminShell";
import CodeGate from "../_components/CodeGate";
import CarrierTraining from "./CarrierTraining";
import CloudHelp from "./CloudHelp";

type Status = "pending" | "sent" | "would_send" | "skipped" | "review";

interface Check {
  _id: string;
  target: string;
  policy: string;
  customer: string;
  phone: string;
  carrier: string;
  agent?: string;
  status: Status;
  reason?: string;
  carrier_due?: string | null;
  message?: string;
  page_url?: string;
  language?: string;
  facts?: {
    amount_due?: number | null;
    autopay?: boolean | null;
    status?: string;
    cancel_date?: string | null;
  };
}

interface Run {
  status: string;
  computer: string;
  started_at?: string;
  finished_at?: string;
  error?: string | null;
}

const TABS: { key: string; label: string; match: (c: Check) => boolean }[] = [
  { key: "review", label: "Needs review", match: (c) => c.status === "review" },
  {
    key: "sent",
    label: "Texted",
    match: (c) => c.status === "sent" || c.status === "would_send",
  },
  { key: "skipped", label: "Skipped", match: (c) => c.status === "skipped" },
  {
    key: "cancel",
    label: "Pending cancel",
    match: (c) => c.facts?.status === "pending_cancel",
  },
  {
    key: "pending",
    label: "Not checked yet",
    match: (c) => c.status === "pending",
  },
];

function chicagoToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
}
function shiftDate(d: string, days: number) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + days);
  return x.toISOString().slice(0, 10);
}
function fmtPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : p || "—";
}
function md(iso?: string | null) {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export default function DueRemindersPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [date, setDate] = useState(chicagoToday());
  const [checks, setChecks] = useState<Check[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [tab, setTab] = useState("review");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [codeRequests, setCodeRequests] = useState<
    { host: string; carrier: string; asked_at: string }[]
  >([]);
  const [codes, setCodes] = useState<Record<string, string>>({});

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
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/due-reminders?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't load");
      setChecks(data.checks || []);
      setRun(data.run || null);
      setDryRun(data.dryRun !== false);
      setCodeRequests(data.codeRequests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isCheckingAuth) return;
    load();
    if (date !== chicagoToday()) return;
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckingAuth, date]);

  const resolve = async (c: Check, action: "send" | "skip") => {
    if (
      action === "send" &&
      !confirm(`Text ${c.customer} at ${fmtPhone(c.phone)}?`)
    )
      return;
    let by = "";
    try {
      by =
        JSON.parse(localStorage.getItem("admin_session") || "{}").username ||
        "";
    } catch {}
    setBusyId(c._id);
    setError("");
    try {
      const res = await fetch("/api/due-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c._id, action, by }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't save");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusyId(null);
    }
  };

  // A carrier asked the cloud worker for an authenticator code (e.g. Progressive)
  const sendCode = async (host: string) => {
    const code = (codes[host] || "").replace(/\D/g, "");
    if (code.length < 4) return;
    setError("");
    try {
      const res = await fetch("/api/due-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "code", host, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't send the code");
      setCodes((x) => ({ ...x, [host]: "" }));
      setCodeRequests((r) => r.filter((x) => x.host !== host));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code");
    }
  };

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [t.key, checks.filter((c) => t.match(c)).length]),
      ),
    [checks],
  );
  const shown = checks.filter((c) => TABS.find((t) => t.key === tab)!.match(c));
  const isToday = date === chicagoToday();

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/due-reminders">
      <CodeGate
        title="Due-date Reminders"
        subtitle="Enter the super admin password"
        storageKey="due_reminders_unlocked_at"
      >
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => (window.location.href = "/admin/super-admin")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Super Admin
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Due-date Reminders
                </h1>
                <p className="text-sm text-gray-500">
                  Checked on each carrier&apos;s site before texting. Runs all
                  day, every day.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDate(shiftDate(date, -1))}
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={date}
                  max={chicagoToday()}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                />
                <button
                  onClick={() => setDate(shiftDate(date, 1))}
                  disabled={isToday}
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={load}
                  disabled={loading}
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 ml-1"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            {codeRequests.map((r) => (
              <div
                key={r.host}
                className="flex flex-wrap items-center gap-2 text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg mb-3"
              >
                <span className="flex-1 min-w-[220px]">
                  🔐 <b>{r.carrier}</b> is asking for its authenticator code.
                  Enter the current code from the authenticator app.
                </span>
                <input
                  value={codes[r.host] || ""}
                  onChange={(e) =>
                    setCodes((x) => ({
                      ...x,
                      [r.host]: e.target.value.replace(/\D/g, "").slice(0, 8),
                    }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && sendCode(r.host)}
                  inputMode="numeric"
                  placeholder="Code"
                  className="w-28 px-3 py-1.5 border border-indigo-200 rounded-lg bg-white"
                />
                <button
                  onClick={() => sendCode(r.host)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Send code
                </button>
              </div>
            ))}

            {dryRun && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-3">
                Test mode — nothing is texted. &quot;Texted&quot; shows what
                would have gone out.
              </p>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 text-sm text-gray-600">
              {run ? (
                <>
                  Run by <b className="text-gray-900">{run.computer}</b> ·{" "}
                  <span
                    className={
                      run.status === "done"
                        ? "text-green-700"
                        : run.status === "failed"
                          ? "text-red-600"
                          : "text-amber-700"
                    }
                  >
                    {run.status === "done"
                      ? "finished"
                      : run.status === "failed"
                        ? "stopped — will retry"
                        : "running"}
                  </span>
                  {run.error && (
                    <span className="text-red-600"> · {run.error}</span>
                  )}
                </>
              ) : (
                "Hasn't run for this day."
              )}
            </div>

            <CloudHelp />

            <CarrierTraining checks={checks} />

            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
              {TABS.map((t) => (
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
                  <span className="text-gray-400 font-normal">
                    {counts[t.key] || 0}
                  </span>
                </button>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-4">
                {error}
              </p>
            )}

            {loading && !checks.length ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : shown.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center text-sm text-gray-500">
                Nothing here.
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((c) => (
                  <div
                    key={c._id}
                    className="bg-white border border-gray-100 rounded-xl p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {c.customer}{" "}
                          <span className="text-sm font-normal text-gray-500">
                            · {fmtPhone(c.phone)}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.carrier} · {c.policy} · report due {md(c.target)}
                          {c.carrier_due && c.carrier_due !== c.target && (
                            <span className="text-amber-700">
                              {" "}
                              · carrier due {md(c.carrier_due)}
                            </span>
                          )}
                          {c.facts?.amount_due != null &&
                            ` · $${Number(c.facts.amount_due).toFixed(2)}`}
                          {c.facts?.autopay === true && " · autopay"}
                          {c.facts?.autopay === false && " · direct bill"}
                          {c.agent && ` · ${c.agent}`}
                        </p>
                        {c.facts?.status === "pending_cancel" && (
                          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 mt-1.5 inline-block">
                            Pending cancellation
                            {c.facts.cancel_date
                              ? ` · cancels ${md(c.facts.cancel_date)}`
                              : ""}
                            {c.facts.amount_due != null
                              ? ` · $${Number(c.facts.amount_due).toFixed(2)} to keep it active`
                              : ""}
                          </p>
                        )}
                        {c.reason && (
                          <p className="text-sm text-gray-700 mt-1.5">
                            {c.reason}
                          </p>
                        )}
                        {c.message && (
                          <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                            {c.language === "es" && (
                              <b className="text-gray-600">ES · </b>
                            )}
                            {c.message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {c.page_url && (
                          <a
                            href={c.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-gray-600 hover:bg-gray-100 flex items-center gap-1"
                          >
                            Carrier page <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {c.status === "review" && (
                          <>
                            {busyId === c._id && (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            )}
                            {c.facts?.amount_due != null && (
                              <button
                                onClick={() => resolve(c, "send")}
                                disabled={busyId === c._id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                              >
                                Send text
                              </button>
                            )}
                            <button
                              onClick={() => resolve(c, "skip")}
                              disabled={busyId === c._id}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              Skip
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CodeGate>
    </AdminShell>
  );
}
