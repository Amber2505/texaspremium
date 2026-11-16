// app/[locale]/admin/_components/PaymentAlert.tsx
// Floating "paid — process now" panel on every admin page (replaces the 45-min SMS).
"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const OVERDUE_MIN = 45;
const PAGE = "/admin/create-payment-link";

interface Waiting {
  _id: string;
  customerPhone: string;
  amount?: number | null;
  description?: string | null;
  createdAtTimestamp: number;
  timestamps?: { payment?: string };
  processingAlerts?: { firstSeenOpenAt?: string };
}

function fmtPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : p;
}

function minsWaiting(l: Waiting) {
  const paid = l.timestamps?.payment
    ? new Date(l.timestamps.payment).getTime()
    : l.createdAtTimestamp;
  const opened = l.processingAlerts?.firstSeenOpenAt
    ? new Date(l.processingAlerts.firstSeenOpenAt).getTime()
    : 0;
  const at = Math.max(paid, opened);
  return Math.max(0, Math.floor((Date.now() - at) / 60000));
}

function waited(mins: number) {
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PaymentAlert({ activePath }: { activePath: string }) {
  const [links, setLinks] = useState<Waiting[]>([]);
  const [open, setOpen] = useState(true);
  const [, tick] = useState(0);
  const overdueSeen = useRef<Set<string>>(new Set());

  useEffect(() => {
    // The Payment Links page already has its own panel
    if (activePath === PAGE) return;
    const load = async () => {
      try {
        const res = await fetch("/api/payments-to-process", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!data.success) return;
        const next: Waiting[] = data.links;
        setLinks(next);
        // A payment just crossed 45 min: chime once and pop the panel open
        const newlyOverdue = next.filter(
          (l) =>
            minsWaiting(l) >= OVERDUE_MIN && !overdueSeen.current.has(l._id),
        );
        newlyOverdue.forEach((l) => overdueSeen.current.add(l._id));
        if (newlyOverdue.length) {
          setOpen(true);
          new Audio("/message_sound.mp3").play().catch(() => {});
        }
      } catch {}
    };
    load();
    const poll = setInterval(load, 30000);
    const clock = setInterval(() => tick((n) => n + 1), 60000); // keep "waited" fresh
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [activePath]);

  if (activePath === PAGE || links.length === 0) return null;

  const overdue = links.filter((l) => minsWaiting(l) >= OVERDUE_MIN).length;

  return (
    <div className="fixed bottom-14 right-4 z-50 w-80">
      <div
        className={`bg-white rounded-xl shadow-lg border-2 ${overdue ? "border-red-500" : "border-amber-400"}`}
      >
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left"
        >
          <span className="relative flex h-3 w-3">
            {overdue > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${overdue ? "bg-red-600" : "bg-amber-500"}`}
            />
          </span>
          <span
            className={`text-sm font-bold ${overdue ? "text-red-700" : "text-amber-800"}`}
          >
            {links.length} paid — process with carrier
          </span>
          <span className="ml-auto text-gray-400">
            {open ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
        </button>

        {open && (
          <div className="px-3 pb-3">
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {links.map((l) => {
                const m = minsWaiting(l);
                const late = m >= OVERDUE_MIN;
                return (
                  <div
                    key={l._id}
                    className={`rounded-lg border px-3 py-2 ${late ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}
                  >
                    <div className="flex justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-900">
                        {fmtPhone(l.customerPhone)}
                        {l.amount ? ` · $${(l.amount / 100).toFixed(2)}` : ""}
                      </p>
                      <span
                        className={`text-[10px] font-bold flex items-center gap-0.5 flex-shrink-0 ${late ? "text-red-600" : "text-amber-700"}`}
                      >
                        {late && <AlertTriangle className="w-3 h-3" />}
                        {waited(m)}
                      </span>
                    </div>
                    {l.description && (
                      <p className="text-[11px] text-gray-600 truncate">
                        {l.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => (window.location.href = PAGE)}
              className="mt-2 w-full py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-black"
            >
              Open Payment Links to mark processed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
