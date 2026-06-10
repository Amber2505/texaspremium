// app/[locale]/admin/accounting/_components/AgencyFeeChart.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

type MonthData = {
  month: string; // "2026-04"
  label: string; // "Apr 2026"
  agencyFees: number;
  premium: number;
  total: number;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "short", year: "numeric" },
  );
}

// Generate last 12 months
function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return months;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as MonthData;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-xs">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className={d.agencyFees >= 0 ? "text-green-600" : "text-red-600"}>
        Agency fees: <span className="font-medium">{fmt(d.agencyFees)}</span>
      </p>
      <p className="text-blue-600">
        Premium: <span className="font-medium">{fmt(d.premium)}</span>
      </p>
      <p className="text-gray-700 border-t border-gray-100 mt-1 pt-1">
        Total: <span className="font-medium">{fmt(d.total)}</span>
      </p>
    </div>
  );
};

export default function AgencyFeeChart({
  activeMonth,
  onMonthSelect,
}: {
  activeMonth: string;
  onMonthSelect?: (monthKey: string) => void;
}) {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"fees" | "premium" | "total">("fees");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const months = getLast12Months();
      const results = await Promise.all(
        months.map(async (month) => {
          try {
            const res = await fetch(`/api/accounting/receipts?month=${month}`);
            if (!res.ok) return null;
            const receipts = await res.json();
            const agencyFees = receipts.reduce(
              (s: number, r: any) => s + (r.totalFees || 0),
              0,
            );
            const premium = receipts.reduce(
              (s: number, r: any) => s + (r.totalPremium || 0),
              0,
            );
            const total = receipts.reduce(
              (s: number, r: any) => s + (r.totalAmount || 0),
              0,
            );
            if (total === 0) return null;
            return {
              month,
              label: getMonthLabel(month),
              agencyFees,
              premium,
              total,
            };
          } catch {
            return null;
          }
        }),
      );
      setData(results.filter(Boolean) as MonthData[]);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const dataKey =
    view === "fees" ? "agencyFees" : view === "premium" ? "premium" : "total";
  const color =
    view === "premium" ? "#2563eb" : view === "total" ? "#7c3aed" : "#ea580c";
  const label =
    view === "fees"
      ? "Agency fees"
      : view === "premium"
        ? "Premium"
        : "Total collected";

  const maxVal = Math.max(...data.map((d) => d[dataKey] || 0), 1);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-32 h-4 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-48 flex items-end gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-100 rounded-t animate-pulse"
              style={{ height: `${Math.random() * 60 + 40}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data.length) return null;

  const totalFees = data.reduce((s, d) => s + d.agencyFees, 0);
  const avgFees = totalFees / data.length;
  const best = data.reduce((a, b) => (a.agencyFees > b.agencyFees ? a : b));

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Monthly overview — last 12 months
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Avg agency fees {fmt(avgFees)}/mo · Best month {best.label} (
            {fmt(best.agencyFees)})
          </p>
        </div>
        <div className="flex gap-1 border border-gray-200 rounded-lg overflow-hidden text-xs">
          {(["fees", "premium", "total"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 capitalize transition ${view === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {v === "fees"
                ? "Agency fees"
                : v === "premium"
                  ? "Premium"
                  : "Total"}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb" }} />
          <Bar
            dataKey={dataKey}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            cursor={onMonthSelect ? "pointer" : "default"}
            onClick={(barData: any) => {
              if (!onMonthSelect) return;
              const clickedMonth = barData?.month || barData?.payload?.month;
              if (clickedMonth && clickedMonth !== activeMonth) {
                onMonthSelect(clickedMonth);
              }
            }}
          >
            {data.map((entry) => {
              const val = entry[dataKey] ?? 0;
              const isNeg = val < 0;
              // For fees view: green when positive, red when negative
              // For other views: use the fixed color
              const positiveColor = view === "fees" ? "#16a34a" : color;
              const negativeColor = "#dc2626";
              const activeColor = isNeg ? negativeColor : positiveColor;
              const fadedColor = isNeg ? "#dc262655" : `${positiveColor}55`;
              return (
                <Cell
                  key={entry.month}
                  fill={entry.month === activeMonth ? activeColor : fadedColor}
                  stroke={entry.month === activeMonth ? activeColor : "none"}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary row */}
      <div className="flex gap-6 mt-3 pt-3 border-t border-gray-100 text-xs">
        {(() => {
          const t = data.reduce((s, d) => s + d.agencyFees, 0);
          return (
            <div>
              <span className="text-gray-500">12-month total fees</span>
              <p
                className={`font-semibold ${t >= 0 ? "text-orange-600" : "text-red-600"}`}
              >
                {fmt(t)}
              </p>
            </div>
          );
        })()}
        <div>
          <span className="text-gray-500">12-month premium</span>
          <p className="font-semibold text-blue-600">
            {fmt(data.reduce((s, d) => s + d.premium, 0))}
          </p>
        </div>
        <div>
          <span className="text-gray-500">12-month total</span>
          <p className="font-semibold text-gray-900">
            {fmt(data.reduce((s, d) => s + d.total, 0))}
          </p>
        </div>
      </div>
    </div>
  );
}
