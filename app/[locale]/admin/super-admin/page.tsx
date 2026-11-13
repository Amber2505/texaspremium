// app/[locale]/admin/super-admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Building2,
  BarChart2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import AdminShell from "../_components/AdminShell";
import CodeGate from "../_components/CodeGate";

const TOOLS = [
  {
    label: "Reminders",
    description: "Track payment schedules & renewals",
    path: "/admin/reminder",
    icon: <Calendar className="w-5 h-5" />,
    iconBg: "bg-green-100 text-green-700",
  },
  {
    label: "Companies",
    description: "Manage company database",
    path: "/admin/companies-link",
    icon: <Building2 className="w-5 h-5" />,
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  {
    label: "Accounting",
    description: "Revenue, reconciliation & Square payouts",
    path: "/admin/accounting",
    icon: <BarChart2 className="w-5 h-5" />,
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    label: "Preview Customer Documents",
    description: "See the document portal as a customer would",
    path: "/admin/docs-preview",
    icon: <Eye className="w-5 h-5" />,
    iconBg: "bg-rose-100 text-rose-700",
  },
];

export default function SuperAdminPage() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/super-admin">
      <CodeGate
        title="Super Admin"
        subtitle="Enter the super admin password"
        storageKey="super_admin_unlocked_at"
      >
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => (window.location.href = "/admin")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Admin
            </button>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">
              Super Admin
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Restricted tools. Unlocked for this browser tab.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOOLS.map((t) => (
                <button
                  key={t.path}
                  onClick={() => (window.location.href = t.path)}
                  className="group bg-white border border-gray-100 rounded-2xl p-5 text-left hover:border-gray-200 hover:shadow-md transition-all duration-200 flex items-start gap-4"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.iconBg}`}
                  >
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm mb-0.5">
                      {t.label}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </CodeGate>
    </AdminShell>
  );
}
