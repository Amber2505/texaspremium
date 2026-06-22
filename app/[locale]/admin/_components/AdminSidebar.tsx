// components/admin/AdminSidebar.tsx
/*eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useRouter } from "next/navigation";
import {
  Users,
  MessageSquare,
  Calendar,
  CreditCard,
  Link2,
  FileText,
  Building2,
  LogOut,
  BarChart2,
  BookOpen,
} from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  activeBg: string;
  activeText: string;
  section: "daily" | "other";
}

const NAV_ITEMS: NavItem[] = [
  // ── Daily tools ────────────────────────────────────────────────────────────
  {
    label: "Live Chat",
    path: "/admin/live-chat",
    icon: <Users className="w-3.5 h-3.5" />,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    activeBg: "bg-blue-50",
    activeText: "text-blue-700",
    section: "daily",
  },
  {
    label: "Messages",
    path: "/admin/message-stored",
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-700",
    activeBg: "bg-violet-50",
    activeText: "text-violet-700",
    section: "daily",
  },
  {
    label: "Reminders",
    path: "/admin/reminder",
    icon: <Calendar className="w-3.5 h-3.5" />,
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
    activeBg: "bg-green-50",
    activeText: "text-green-700",
    section: "daily",
  },
  {
    label: "Autopay Portal",
    path: "/admin/autopay",
    icon: <CreditCard className="w-3.5 h-3.5" />,
    iconBg: "bg-red-100",
    iconColor: "text-red-700",
    activeBg: "bg-red-50",
    activeText: "text-red-700",
    section: "daily",
  },
  {
    label: "Payment Links",
    path: "/admin/create-payment-link",
    icon: <Link2 className="w-3.5 h-3.5" />,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
    activeBg: "bg-orange-50",
    activeText: "text-orange-700",
    section: "daily",
  },
  {
    label: "PDF Merger",
    path: "/admin/pdf-merger",
    icon: <FileText className="w-3.5 h-3.5" />,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-700",
    activeBg: "bg-pink-50",
    activeText: "text-pink-700",
    section: "daily",
  },
  // ── Other tools ────────────────────────────────────────────────────────────
  {
    label: "Quote Generator",
    path: "/admin/create-quote-proposal",
    icon: <FileText className="w-3.5 h-3.5" />,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-700",
    activeBg: "bg-teal-50",
    activeText: "text-teal-700",
    section: "other",
  },
  {
    label: "Companies",
    path: "/admin/companies-link",
    icon: <Building2 className="w-3.5 h-3.5" />,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-700",
    activeBg: "bg-indigo-50",
    activeText: "text-indigo-700",
    section: "other",
  },
  {
    label: "Accounting",
    path: "/admin/accounting",
    icon: <BarChart2 className="w-3.5 h-3.5" />,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    activeBg: "bg-emerald-50",
    activeText: "text-emerald-700",
    section: "other",
  },
  {
    label: "Guides",
    path: "/admin/guides",
    icon: <BookOpen className="w-3.5 h-3.5" />,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    activeBg: "bg-amber-50",
    activeText: "text-amber-700",
    section: "other",
  },
];

interface AdminSidebarProps {
  activePath: string;
}

export default function AdminSidebar({ activePath }: AdminSidebarProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("admin_session");
    window.location.href = "/admin";
  };

  const navigate = (path: string) => {
    window.location.href = path;
  };

  const dailyItems = NAV_ITEMS.filter((i) => i.section === "daily");
  const otherItems = NAV_ITEMS.filter((i) => i.section === "other");

  return (
    <div className="w-48 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen z-20">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 hover:opacity-80 transition"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center flex-shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800">Admin</span>
        </button>
      </div>

      {/* Daily tools */}
      <div className="flex flex-col flex-1 overflow-y-auto px-2 py-3 gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-2 mb-1">
          Daily tools
        </p>

        {dailyItems.map((item) => {
          const isActive = activePath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left w-full transition group ${
                isActive
                  ? `${item.activeBg} ${item.activeText} font-medium`
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isActive ? item.iconBg : "bg-gray-100 group-hover:bg-gray-200"
                } ${isActive ? item.iconColor : "text-gray-500 group-hover:text-gray-600"} transition`}
              >
                {item.icon}
              </div>
              <span className="text-xs leading-tight">{item.label}</span>
            </button>
          );
        })}

        {/* Other tools */}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-2 mb-1">
            Other tools
          </p>
          {otherItems.map((item) => {
            const isActive = activePath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left w-full transition group ${
                  isActive
                    ? `${item.activeBg} ${item.activeText} font-medium`
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                    isActive
                      ? item.iconBg
                      : "bg-gray-100 group-hover:bg-gray-200"
                  } ${isActive ? item.iconColor : "text-gray-500 group-hover:text-gray-600"} transition`}
                >
                  {item.icon}
                </div>
                <span className="text-xs leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition w-full px-2 py-1.5 rounded-lg hover:bg-red-50"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-xs">Logout</span>
        </button>
      </div>
    </div>
  );
}
