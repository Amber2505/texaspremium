// app/[locale]/admin/agent-activity/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import AdminShell from "../_components/AdminShell";
import CodeGate from "../_components/CodeGate";

type State = "active" | "idle" | "locked";

interface Sample {
  t: string; // ISO minute (UTC)
  s: State;
  d?: string; // domain in front, active minutes only
  a?: string; // TurboRater agent signed in
}

interface ComputerDay {
  computer: string;
  samples: Sample[];
}

// Office hours shown on the timeline (Central time)
const DAY_START = 8; // 8 AM
const DAY_END = 20; // 8 PM
const SPAN = (DAY_END - DAY_START) * 60;
const IDLE_FLAG_MIN = 30; // gaps this long get called out

const COLORS: Record<State | "off", string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-300",
  locked: "bg-slate-300",
  off: "bg-transparent",
};

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

// Minutes since midnight, Central time
function minuteOfDay(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return h * 60 + m;
}

function clock(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
}

function hrs(min: number) {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

interface Segment {
  start: number; // minute of day
  end: number; // exclusive
  state: State | "off";
}

function analyze(allSamples: Sample[]) {
  // Only office hours count: 8 AM–8 PM Central
  const samples = allSamples.filter((s) => {
    const m = minuteOfDay(s.t);
    return m >= DAY_START * 60 && m < DAY_END * 60;
  });
  const byMin = new Map<number, Sample>();
  samples.forEach((s) => byMin.set(minuteOfDay(s.t), s));
  const mins = [...byMin.keys()].sort((a, b) => a - b);

  // Build contiguous segments; minutes with no sample = computer off / Chrome closed
  const segments: Segment[] = [];
  for (let m = DAY_START * 60; m < DAY_END * 60; m++) {
    const st: State | "off" = byMin.get(m)?.s ?? "off";
    const last = segments[segments.length - 1];
    if (last && last.state === st && last.end === m) last.end = m + 1;
    else segments.push({ start: m, end: m + 1, state: st });
  }

  const active = samples.filter((s) => s.s === "active").length;
  const idle = samples.filter((s) => s.s === "idle").length;
  const locked = samples.filter((s) => s.s === "locked").length;

  // Long breaks between first and last activity (idle, locked or off)
  const actMins = mins.filter((m) => byMin.get(m)!.s === "active");
  const first = actMins[0];
  const last = actMins[actMins.length - 1];
  const gaps: { start: number; end: number }[] = [];
  for (let i = 1; i < actMins.length; i++) {
    if (actMins[i] - actMins[i - 1] > IDLE_FLAG_MIN) {
      gaps.push({ start: actMins[i - 1] + 1, end: actMins[i] });
    }
  }

  const domains = new Map<string, number>();
  samples.forEach((s) => {
    if (s.s === "active" && s.d) domains.set(s.d, (domains.get(s.d) || 0) + 1);
  });
  const topDomains = [...domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const agents = [
    ...new Set(samples.map((s) => s.a).filter(Boolean)),
  ] as string[];
  const span = first !== undefined ? last - first + 1 : 0;

  return {
    segments,
    active,
    idle,
    locked,
    first,
    last,
    gaps,
    topDomains,
    agents,
    span,
  };
}

export default function AgentActivityPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [date, setDate] = useState(chicagoToday());
  const [data, setData] = useState<ComputerDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<{ computer: string; seg: Segment } | null>(
    null,
  );

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
      const res = await fetch(`/api/agent-activity?date=${date}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.detail || json.error || "Couldn't load activity");
      setData(json.computers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isCheckingAuth) return;
    load();
    // Today's view refreshes itself every 2 minutes
    if (date !== chicagoToday()) return;
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckingAuth, date]);

  const rows = useMemo(
    () =>
      data
        .map((c) => ({ ...c, stats: analyze(c.samples) }))
        .sort((a, b) => a.computer.localeCompare(b.computer)),
    [data],
  );

  const hours = Array.from(
    { length: DAY_END - DAY_START + 1 },
    (_, i) => DAY_START + i,
  );
  const isToday = date === chicagoToday();

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/agent-activity">
      <CodeGate
        title="Agent Activity"
        subtitle="Enter the super admin password"
        storageKey="agent_activity_unlocked_at"
      >
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-6xl mx-auto">
            <button
              onClick={() => (window.location.href = "/admin/super-admin")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Super Admin
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Agent Activity
                </h1>
                <p className="text-sm text-gray-500">
                  Mouse and keyboard use on each office computer, minute by
                  minute. Idle can still be work — a phone call with a customer
                  looks idle here.
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

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-4">
              {[
                ["bg-emerald-500", "Working (mouse/keyboard)"],
                ["bg-amber-300", "No movement 2+ min"],
                ["bg-slate-300", "Screen locked"],
                [
                  "bg-white border border-dashed border-gray-300",
                  "Computer off / Chrome closed",
                ],
              ].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm inline-block ${c}`} />
                  {l}
                </span>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-4">
                {error}
              </p>
            )}

            {loading && !rows.length ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : rows.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center text-sm text-gray-500">
                No activity recorded for this day.
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map(({ computer, stats }) => {
                  const tracked = stats.active + stats.idle + stats.locked;
                  const pct = tracked
                    ? Math.round((stats.active / tracked) * 100)
                    : 0;
                  return (
                    <div
                      key={computer}
                      className="bg-white border border-gray-100 rounded-2xl p-5"
                    >
                      {/* Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {computer}
                          </p>
                          <p className="text-xs text-gray-400">
                            {stats.agents.length
                              ? `Signed in to TurboRater: ${stats.agents.join(", ")}`
                              : "No TurboRater sign-in seen"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-5 text-right">
                          {[
                            {
                              l: "First / last",
                              v:
                                stats.first !== undefined
                                  ? `${clock(stats.first)} – ${clock(stats.last)}`
                                  : "—",
                              c: "text-gray-900",
                            },
                            {
                              l: "Working",
                              v: hrs(stats.active),
                              c: "text-emerald-700",
                            },
                            {
                              l: "No movement",
                              v: hrs(stats.idle),
                              c: "text-amber-700",
                            },
                            {
                              l: "Active share",
                              v: `${pct}%`,
                              c:
                                pct >= 60
                                  ? "text-emerald-700"
                                  : pct >= 40
                                    ? "text-amber-700"
                                    : "text-red-600",
                            },
                          ].map((s) => (
                            <div key={s.l}>
                              <p className="text-[11px] text-gray-400">{s.l}</p>
                              <p className={`text-sm font-bold ${s.c}`}>
                                {s.v}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="relative">
                        <div className="relative h-8 rounded-lg overflow-hidden border border-dashed border-gray-200 bg-white">
                          {stats.segments
                            .filter((s) => s.state !== "off")
                            .map((s) => (
                              <div
                                key={s.start}
                                onMouseEnter={() =>
                                  setHover({ computer, seg: s })
                                }
                                onMouseLeave={() => setHover(null)}
                                className={`absolute top-0 bottom-0 ${COLORS[s.state]}`}
                                style={{
                                  left: `${((s.start - DAY_START * 60) / SPAN) * 100}%`,
                                  width: `${((s.end - s.start) / SPAN) * 100}%`,
                                }}
                              />
                            ))}
                        </div>
                        {/* Hour ticks */}
                        <div className="relative h-4 mt-1">
                          {hours.map((h) => (
                            <span
                              key={h}
                              className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                              style={{
                                left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
                              }}
                            >
                              {((h + 11) % 12) + 1}
                              {h >= 12 ? "p" : "a"}
                            </span>
                          ))}
                        </div>
                        {hover?.computer === computer && (
                          <div className="text-xs text-gray-600 mt-1">
                            {clock(hover.seg.start)} – {clock(hover.seg.end)} ·{" "}
                            <b>
                              {hover.seg.state === "active"
                                ? "Working"
                                : hover.seg.state === "idle"
                                  ? "No movement"
                                  : "Screen locked"}
                            </b>{" "}
                            ({hrs(hover.seg.end - hover.seg.start)})
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="grid sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-100">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">
                            Breaks over {IDLE_FLAG_MIN} min
                          </p>
                          {stats.gaps.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {stats.gaps.map((g) => (
                                <span
                                  key={g.start}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                                >
                                  {clock(g.start)} – {clock(g.end)} (
                                  {hrs(g.end - g.start)})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">None</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">
                            Where the time went (working minutes)
                          </p>
                          {stats.topDomains.length ? (
                            <div className="space-y-1">
                              {stats.topDomains.map(([d, n]) => (
                                <div
                                  key={d}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <span className="w-36 truncate text-gray-700">
                                    {d}
                                  </span>
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-slate-500"
                                      style={{
                                        width: `${(n / Math.max(stats.active, 1)) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="w-12 text-right text-gray-500">
                                    {hrs(n)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">—</p>
                          )}
                        </div>
                      </div>
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
