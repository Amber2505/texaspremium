// app/[locale]/admin/due-reminders/CarrierTraining.tsx
// Carrier list for due-date reminders. Company names come from company_database
// (plus any carrier name in the reports that isn't there yet). Paste the agent
// site, click Train, look up one policy in the tab that opens: that lookup is
// trusted right away and tied to the company.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Loader2,
  Search,
} from "lucide-react";

interface CheckLite {
  carrier: string;
  policy: string;
  status: string;
  reason?: string;
}
interface Carriers {
  methods: {
    host: string;
    kind: "url" | "search";
    seen: number;
    trusted: boolean;
  }[];
  companies: { name: string; hosts: string[] }[];
  trustAfter: number;
}
interface DbCompany {
  name: string;
  agentPortal: string;
}
interface Row {
  name: string;
  aliases: string[]; // carrier names as the AgencyMatrix report writes them
  portal: string;
  policies: string[]; // today's policies for this company (to try while training)
  needsLookup: boolean; // something in today's list stopped at "No lookup"
}

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// "UNITED AUTOMOBILE INSURAN" (report cuts names off) matches "United Automobile Insurance Company"
const sameCompany = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return (
    !!x &&
    !!y &&
    (x === y ||
      (Math.min(x.length, y.length) >= 6 &&
        (x.startsWith(y) || y.startsWith(x))))
  );
};
const TRAIN_MS = 30 * 60 * 1000;

export default function CarrierTraining({ checks }: { checks: CheckLite[] }) {
  const [open, setOpen] = useState(false);
  const [dbCompanies, setDbCompanies] = useState<DbCompany[] | null>(null);
  const [carriers, setCarriers] = useState<Carriers | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [training, setTraining] = useState<
    Record<string, { until: number; policy: string }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCarriers = useCallback(async () => {
    try {
      const d = await fetch("/api/due-reminders?carriers=1", {
        cache: "no-store",
      }).then((r) => r.json());
      if (d.methods) setCarriers(d);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open || dbCompanies) return;
    fetch("/api/due-reminders/train", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setDbCompanies(d.companies || []))
      .catch(() => setDbCompanies([]));
    loadCarriers();
  }, [open, dbCompanies, loadCarriers]);

  // While something is training, check every 15s whether the lookup was learned
  const anyTraining = Object.values(training).some((t) => t.until > Date.now());
  useEffect(() => {
    if (!anyTraining) return;
    pollRef.current = setInterval(loadCarriers, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [anyTraining, loadCarriers]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = (dbCompanies || []).map((c) => ({
      name: c.name,
      aliases: [],
      portal: c.agentPortal || "",
      policies: [],
      needsLookup: false,
    }));
    for (const c of checks) {
      if (!c.carrier) continue;
      let row = list.find(
        (r) =>
          sameCompany(r.name, c.carrier) ||
          r.aliases.some((a) => norm(a) === norm(c.carrier)),
      );
      if (!row) {
        row = {
          name: c.carrier,
          aliases: [],
          portal: "",
          policies: [],
          needsLookup: false,
        };
        list.push(row);
      }
      if (
        norm(row.name) !== norm(c.carrier) &&
        !row.aliases.some((a) => norm(a) === norm(c.carrier))
      ) {
        row.aliases.push(c.carrier);
      }
      if (c.policy && !row.policies.includes(c.policy))
        row.policies.push(c.policy);
      if (c.status === "review" && /no lookup/i.test(c.reason || ""))
        row.needsLookup = true;
    }
    return list.sort(
      (a, b) =>
        Number(b.needsLookup) - Number(a.needsLookup) ||
        Number(b.policies.length > 0) - Number(a.policies.length > 0) ||
        a.name.localeCompare(b.name),
    );
  }, [dbCompanies, checks]);

  const statusFor = (row: Row) => {
    if (!carriers) return null;
    const names = [row.name, ...row.aliases].map(norm);
    const hosts = new Set(
      carriers.companies
        .filter((c) => names.includes(norm(c.name)))
        .flatMap((c) => c.hosts),
    );
    const methods = carriers.methods.filter((m) => hosts.has(m.host));
    if (methods.some((m) => m.trusted))
      return { label: "In use", cls: "bg-green-100 text-green-800" };
    if (methods.length) {
      const seen = Math.max(...methods.map((m) => m.seen));
      return {
        label: `Learning ${seen}/${carriers.trustAfter}`,
        cls: "bg-amber-100 text-amber-800",
      };
    }
    return { label: "Not set up", cls: "bg-gray-100 text-gray-500" };
  };

  const train = async (row: Row) => {
    const portal = (edits[row.name] ?? row.portal).trim();
    if (!/^https:\/\/\S+\.\S+/.test(portal)) {
      setError(
        `Paste the agent website for ${row.name} (starting with https://)`,
      );
      return;
    }
    setError("");
    setBusy(row.name);
    try {
      const res = await fetch("/api/due-reminders/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, aliases: row.aliases, portal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't start training");
      const policy = row.policies[0] || "";
      if (policy) navigator.clipboard.writeText(policy).catch(() => {});
      setDbCompanies((prev) =>
        (prev || []).some((c) => c.name === row.name)
          ? (prev || []).map((c) =>
              c.name === row.name ? { ...c, agentPortal: portal } : c,
            )
          : [...(prev || []), { name: row.name, agentPortal: portal }],
      );
      setTraining((t) => ({
        ...t,
        [row.name]: { until: Date.now() + TRAIN_MS, policy },
      }));
      window.open(portal, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start training");
    } finally {
      setBusy(null);
    }
  };

  const shown = rows.filter(
    (r) =>
      !search.trim() ||
      [r.name, ...r.aliases].some((n) =>
        n.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const needCount = rows.filter((r) => r.needsLookup).length;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700"
      >
        <span>
          Carriers{" "}
          {needCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-red-100 text-red-700">
              {needCount} need training
            </span>
          )}
        </span>
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 mb-3">
            Paste the site agents use to look up a policy, then click{" "}
            <b>Train</b>. A new tab opens and one of today&apos;s policy numbers
            is copied. Paste it into the site&apos;s search and open the policy.
            Make sure you&apos;re signed in. The lookup is saved and used from
            then on.
          </p>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-3">
              {error}
            </p>
          )}

          {!dbCompanies ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {shown.map((row) => {
                const st = statusFor(row);
                const t = training[row.name];
                const isTraining =
                  t && t.until > Date.now() && st?.label !== "In use";
                const learned = t && st?.label === "In use";
                const value = edits[row.name] ?? row.portal;
                return (
                  <div key={row.name} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[200px] flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {row.name}
                          {row.needsLookup && (
                            <span className="ml-2 text-[10px] font-bold text-red-600">
                              IN TODAY&apos;S LIST
                            </span>
                          )}
                        </p>
                        {row.aliases.length > 0 && (
                          <p className="text-[11px] text-gray-400">
                            In report as: {row.aliases.join(", ")}
                          </p>
                        )}
                      </div>
                      {st && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}
                        >
                          {learned ? "Learned ✓" : st.label}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        value={value}
                        onChange={(e) =>
                          setEdits((x) => ({
                            ...x,
                            [row.name]: e.target.value,
                          }))
                        }
                        placeholder="https://agent site for policy lookup"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                      />
                      {value && /^https:\/\//.test(value) && (
                        <a
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 flex items-center text-gray-400 hover:text-gray-700"
                          title="Open site"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => train(row)}
                        disabled={busy === row.name}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {busy === row.name ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <GraduationCap className="w-3.5 h-3.5" />
                        )}
                        Train
                      </button>
                    </div>
                    {isTraining && (
                      <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-2">
                        Training for 30 min.{" "}
                        {t.policy ? (
                          <>
                            Paste <b>{t.policy}</b> (copied) into the
                            site&apos;s search and open the policy.
                          </>
                        ) : (
                          <>
                            Search any policy for this company on the site and
                            open it.
                          </>
                        )}{" "}
                        This turns into <b>Learned ✓</b> once it&apos;s saved.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
