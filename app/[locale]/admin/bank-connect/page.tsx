// app/[locale]/admin/bank-connect/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useEffect, useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import AdminShell from "../_components/AdminShell";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Building2,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function BankConnectPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "square" | "all">(
    "overview",
  );
  const [monthKey, setMonthKey] = useState(getMonthKey());

  const isOAuthRedirect =
    typeof window !== "undefined" &&
    window.location.href.includes("oauth_state_id");

  const receivedRedirectUri = isOAuthRedirect
    ? window.location.href
    : undefined;

  // Auth check
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
      } else {
        setIsCheckingAuth(false);
      }
    } catch {
      localStorage.removeItem("admin_session");
      window.location.href = "/admin";
    }
  }, []);

  useEffect(() => {
    if (isCheckingAuth) return;
    setTokenLoading(true);
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.link_token) setLinkToken(d.link_token);
      })
      .catch(console.error)
      .finally(() => setTokenLoading(false));
    loadData();
  }, [isCheckingAuth]);

  useEffect(() => {
    if (!isCheckingAuth) loadData();
  }, [monthKey]);

  const loadData = async () => {
    try {
      const [txRes, analysisRes] = await Promise.all([
        fetch("/api/plaid/transactions"),
        fetch(`/api/plaid/bank-analysis?month=${monthKey}`),
      ]);
      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions || []);
      }
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setAnalysis(data);
      }
    } catch {}
  };

  const onSuccess = useCallback(async (public_token: string) => {
    try {
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      setConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      alert("Failed to save connection. Please try again.");
    }
  }, []);

  const onExit = useCallback((err: any) => {
    if (err && Object.keys(err).length > 0) console.error("Plaid exit:", err);
  }, []);

  const config: any = { token: linkToken, onSuccess, onExit };
  if (receivedRedirectUri) config.receivedRedirectUri = receivedRedirectUri;

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (ready && linkToken && receivedRedirectUri) open();
  }, [ready, linkToken, receivedRedirectUri, open]);

  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const s = analysis?.summary;

  return (
    <AdminShell activePath="/admin/bank-connect">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => (window.location.href = "/admin")}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1.5"
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
                  Bank Account
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Chase Business Checking — Plaid connected
                </p>
              </div>
              <div className="flex gap-2 items-center">
                {/* Month picker */}
                <select
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadData}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      const res = await fetch("/api/plaid/sync-transactions", {
                        method: "POST",
                      });
                      const data = await res.json();
                      if (data.error)
                        alert(`Sync error: ${data.message || data.error}`);
                      else {
                        await loadData();
                        alert(`Synced ${data.synced} transactions!`);
                      }
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  disabled={syncing}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5"
                >
                  {syncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    "Sync Now"
                  )}
                </button>
                <button
                  onClick={() => open()}
                  disabled={!ready || !linkToken || tokenLoading}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {tokenLoading ? "Loading…" : "Reconnect"}
                </button>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-gray-500">Total deposited</p>
                </div>
                <p className="text-xl font-bold text-green-700">
                  {fmt(s.totalDeposited)}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-gray-500">Total withdrawn</p>
                </div>
                <p className="text-xl font-bold text-red-600">
                  {fmt(s.totalWithdrawn)}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-purple-500" />
                  <p className="text-xs text-gray-500">Net cash flow</p>
                </div>
                <p
                  className={`text-xl font-bold ${s.netCashFlow >= 0 ? "text-green-700" : "text-red-600"}`}
                >
                  {fmt(s.netCashFlow)}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
                <p className="text-xl font-bold text-amber-600">
                  {fmt(s.totalPendingAmount)}
                </p>
                <p className="text-[10px] text-gray-400">
                  {s.pendingCount} transactions
                </p>
              </div>
            </div>
          )}

          {/* Square reconciliation with bank */}
          {s && (
            <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600" />
                Square → Bank Reconciliation
              </h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg bg-purple-50 border border-purple-100 p-4">
                  <p className="text-xs text-purple-600 mb-1">
                    Square deposits received
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {fmt(s.totalSquareDeposited)}
                  </p>
                  <p className="text-[10px] text-purple-500 mt-1">
                    {analysis.squareDeposits.length} deposits from Square
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-4">
                  <p className="text-xs text-green-600 mb-1">Cash deposits</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {fmt(s.totalCashDeposited)}
                  </p>
                  <p className="text-[10px] text-green-500 mt-1">
                    {analysis.cashDeposits.length} cash transactions
                  </p>
                </div>
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4">
                  <p className="text-xs text-indigo-600 mb-1">Zelle received</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {fmt(s.totalZelleDeposited)}
                  </p>
                  <p className="text-[10px] text-indigo-500 mt-1">
                    {analysis.zelleDeposits.length} Zelle transfers
                  </p>
                </div>
              </div>

              {/* Square deposit list */}
              {analysis.squareDeposits.length > 0 && (
                <div className="border border-purple-100 rounded-lg overflow-hidden">
                  <div className="bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Square payouts deposited to your Chase account
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analysis.squareDeposits.map((tx: any) => (
                        <tr
                          key={tx.transaction_id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-3 py-2 text-gray-500">{tx.date}</td>
                          <td className="px-3 py-2 text-gray-900">{tx.name}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-600">
                            +{fmt(Math.abs(tx.amount))}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {tx.pending ? (
                              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                                Pending
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                ✓ Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {analysis.squareDeposits.length === 0 && (
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  No Square deposits found in bank for{" "}
                  {months.find((m) => m.key === monthKey)?.label} — sync may be
                  needed or deposits may be under a different name
                </div>
              )}
            </div>
          )}

          {/* Pending transactions */}
          {s && s.pendingCount > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Pending Transactions ({s.pendingCount})
              </h2>
              <div className="border border-amber-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-50 text-gray-500">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.pending.map((tx: any) => (
                      <tr key={tx.transaction_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{tx.date}</td>
                        <td className="px-3 py-2 text-gray-900">{tx.name}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${tx.amount > 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {tx.amount > 0 ? "-" : "+"}
                          {fmt(Math.abs(tx.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All transactions */}
          {transactions.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  All Transactions —{" "}
                  {months.find((m) => m.key === monthKey)?.label}
                </h2>
                <span className="text-xs text-gray-400">
                  {
                    transactions.filter((tx) => tx.date?.startsWith(monthKey))
                      .length
                  }{" "}
                  transactions
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions
                    .filter((tx) => tx.date?.startsWith(monthKey))
                    .slice(0, 100)
                    .map((tx: any) => (
                      <tr key={tx.transaction_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900 max-w-[220px] truncate">
                          {tx.name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">
                          {tx.category?.[0] || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {tx.pending ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                              Pending
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                              Settled
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tx.amount > 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {tx.amount > 0 ? "-" : "+"}
                          {fmt(Math.abs(tx.amount))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {transactions.filter((tx) => tx.date?.startsWith(monthKey))
                .length > 100 && (
                <p className="text-xs text-gray-400 text-center py-3">
                  Showing 100 of{" "}
                  {
                    transactions.filter((tx) => tx.date?.startsWith(monthKey))
                      .length
                  }
                </p>
              )}
            </div>
          )}

          {transactions.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-sm">
              No transactions yet — connect your account and click Sync Now
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
