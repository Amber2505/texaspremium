// app/[locale]/admin/accounting/_components/CashPayrollCard.tsx
// "− Cash payroll" in the revenue row: cash paid to employees, entered by hand.
"use client";

import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

export type CashPayrollEntry = {
  _id: string;
  date: string;
  name: string;
  amount: number;
  note?: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function CashPayrollCard({
  monthKey,
  entries,
  onAdd,
  onDelete,
}: {
  monthKey: string;
  entries: CashPayrollEntry[];
  onAdd: (e: { date: string; name: string; amount: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(
    today.startsWith(monthKey) ? today : `${monthKey}-01`,
  );
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const add = async () => {
    const n = Number(amount);
    if (!date.startsWith(monthKey))
      return setError("Pick a date in this month");
    if (!(n > 0)) return setError("Enter an amount");
    setBusy(true);
    setError("");
    try {
      await onAdd({ date, name: name.trim(), amount: n });
      setName("");
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-center">
      <span className="text-xl text-gray-300 font-light mr-2">−</span>
      <div>
        <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
          Cash payroll
          <button
            onClick={() => setOpen(!open)}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
            title="Add or view cash payroll"
          >
            {open ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </p>
        <button
          onClick={() => setOpen(!open)}
          className="text-xl font-bold text-red-600 hover:underline"
          title={`${entries.length} cash payment${entries.length !== 1 ? "s" : ""}`}
        >
          {fmt(total)}
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Cash paid to employees
          </p>
          <div className="flex gap-1.5 mb-1.5">
            <input
              type="date"
              value={date}
              min={`${monthKey}-01`}
              max={`${monthKey}-31`}
              onChange={(e) => setDate(e.target.value)}
              className="w-32 text-xs border border-gray-300 rounded px-1.5 py-1"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1 text-right"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Employee"
              className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1"
            />
            <button
              onClick={add}
              disabled={busy}
              className="text-xs px-3 py-1 rounded bg-gray-900 text-white font-semibold disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}

          <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
            {entries.length === 0 && (
              <p className="text-[11px] text-gray-400 py-2">
                Nothing entered this month.
              </p>
            )}
            {entries.map((e) => (
              <div
                key={e._id}
                className="flex items-center gap-2 py-1.5 text-xs"
              >
                <span className="text-gray-500 w-12">
                  {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="flex-1 truncate text-gray-800">
                  {e.name || "—"}
                </span>
                <span className="font-semibold text-red-600">
                  {fmt(e.amount)}
                </span>
                <button
                  onClick={() =>
                    confirm(
                      `Delete ${fmt(e.amount)}${e.name ? ` for ${e.name}` : ""}?`,
                    ) && onDelete(e._id)
                  }
                  className="p-0.5 text-gray-300 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
