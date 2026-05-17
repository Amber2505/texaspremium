// app/[locale]/admin/bank-connect/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import AdminShell from "../_components/AdminShell";

export default function BankConnectPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

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
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token));
    loadTransactions();
  }, [isCheckingAuth]);

  const loadTransactions = async () => {
    try {
      const res = await fetch("/api/plaid/transactions");
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch {}
  };

  const onSuccess = useCallback(async (public_token: string) => {
    await fetch("/api/plaid/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_token }),
    });
    setConnected(true);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken!, onSuccess });

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/bank-connect">
      <div className="max-w-lg mx-auto mt-20 text-center p-8 bg-white rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Connect Chase Account
        </h1>
        <p className="text-gray-500 mb-8 text-sm">
          One-time setup — your credentials are never stored
        </p>
        {connected && (
          <p className="text-green-600 font-semibold mb-4">
            ✓ Chase account connected successfully!
          </p>
        )}
        <div className="flex gap-3 justify-center mb-8">
          <button
            onClick={() => open()}
            disabled={!ready || !linkToken}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
          >
            {connected ? "Reconnect Account" : "Connect Chase Account"}
          </button>
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                const res = await fetch("/api/plaid/sync-transactions", {
                  method: "POST",
                });
                const data = await res.json();
                await loadTransactions();
                alert(`Synced ${data.synced} transactions!`);
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Transactions */}
      {transactions.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 pb-12">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Recent Bank Transactions ({transactions.length})
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-left">Category</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.slice(0, 50).map((tx: any) => (
                  <tr key={tx.transaction_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 max-w-[200px] truncate">
                      {tx.name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {tx.category?.[0] || "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tx.amount > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {tx.amount > 0 ? "-" : "+"}$
                      {Math.abs(tx.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-2">
                Showing 50 of {transactions.length}
              </p>
            )}
          </div>
        </div>
      )}

      {!isCheckingAuth && transactions.length === 0 && (
        <div className="max-w-3xl mx-auto px-4 pb-12">
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">
            No transactions yet — connect your account and click Sync Now
          </div>
        </div>
      )}
    </AdminShell>
  );
}
