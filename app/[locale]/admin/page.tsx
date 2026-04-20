// app/admin/page.tsx
"use client";
import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Users,
  Calendar,
  Shield,
  MessageSquare,
  CreditCard,
  Building2,
  Link2,
  FileText,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

const ADMIN_PASSWORD = "Insurance2024";
const SESSION_KEY = "admin_session";

interface AdminSession {
  username: string;
  loginTime: number;
  expiresAt: number;
}

interface NavCard {
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  accent: string;
  iconBg: string;
}

export default function AdminLoginPage() {
  const [view, setView] = useState<"login" | "security" | "dashboard">("login");
  const [username, setUsername] = useState("");
  const [sessionUsername, setSessionUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Security code state
  const [securityCode, setSecurityCode] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const getEndOfDayTimestamp = () => {
    const now = new Date();
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    return endOfDay.getTime();
  };

  const checkExistingSession = () => {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const session: AdminSession = JSON.parse(savedSession);
        if (Date.now() < session.expiresAt) {
          setSessionUsername(session.username);
          setView("dashboard");
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsCheckingSession(false);
  };

  // Step 1: Validate username + password, then show security code prompt
  const handleLogin = () => {
    setError("");
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }
    if (password !== ADMIN_PASSWORD) {
      setError("Incorrect password");
      return;
    }
    // Credentials OK → ask for daily security code
    setView("security");
  };

  // Step 2: Verify daily security code, then create session
  const handleSecuritySubmit = async () => {
    if (securityCode.length !== 4) return;
    setIsVerifying(true);
    setSecurityError("");
    try {
      const res = await fetch("/api/verify-security-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: securityCode, username: username.trim() }),
      });
      const data = await res.json();
      if (!data.valid) {
        setSecurityError("Invalid security code. Please try again.");
        setSecurityCode("");
        setIsVerifying(false);
        return;
      }
    } catch {
      setSecurityError("Could not verify code. Please try again.");
      setSecurityCode("");
      setIsVerifying(false);
      return;
    }

    // Code verified → create session and go to dashboard
    const session: AdminSession = {
      username: username.trim(),
      loginTime: Date.now(),
      expiresAt: getEndOfDayTimestamp(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setSessionUsername(username.trim());
    setSecurityCode("");
    setIsVerifying(false);
    setView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUsername("");
    setPassword("");
    setSessionUsername("");
    setSecurityCode("");
    setSecurityError("");
    setView("login");
  };

  // Go back to login from security step
  const handleBackToLogin = () => {
    setView("login");
    setSecurityCode("");
    setSecurityError("");
  };

  // ── Card definitions ──────────────────────────────────────────────────────

  const primaryCards: NavCard[] = [
    {
      label: "Live Chat",
      description: "Respond to customer inquiries in real time",
      path: "/admin/live-chat",
      icon: <Users className="w-5 h-5" />,
      accent: "#1d4ed8",
      iconBg: "bg-blue-100 text-blue-700",
    },
    {
      label: "Messages",
      description: "SMS & MMS via RingCentral",
      path: "/admin/message-stored",
      icon: <MessageSquare className="w-5 h-5" />,
      accent: "#6d28d9",
      iconBg: "bg-violet-100 text-violet-700",
    },
    {
      label: "Reminders",
      description: "Track payment schedules & renewals",
      path: "/admin/reminder",
      icon: <Calendar className="w-5 h-5" />,
      accent: "#15803d",
      iconBg: "bg-green-100 text-green-700",
    },
    {
      label: "Autopay Portal",
      description: "View & manage customer payment methods",
      path: "/admin/autopay",
      icon: <CreditCard className="w-5 h-5" />,
      accent: "#b91c1c",
      iconBg: "bg-red-100 text-red-700",
    },
    {
      label: "Payment Links",
      description: "Generate Square & autopay links",
      path: "/admin/create-payment-link",
      icon: <Link2 className="w-5 h-5" />,
      accent: "#c2410c",
      iconBg: "bg-orange-100 text-orange-700",
    },
    {
      label: "PDF Merger",
      description: "Build & download policy packages",
      path: "/admin/pdf-merger",
      icon: <FileText className="w-5 h-5" />,
      accent: "#be185d",
      iconBg: "bg-pink-100 text-pink-700",
    },
  ];

  const secondaryCards: NavCard[] = [
    {
      label: "Quote Generator",
      description: "Create insurance quote proposals",
      path: "/admin/create-quote-proposal",
      icon: <FileText className="w-5 h-5" />,
      accent: "#0f766e",
      iconBg: "bg-teal-100 text-teal-700",
    },
    {
      label: "Companies",
      description: "Manage company database",
      path: "/admin/companies-link",
      icon: <Building2 className="w-5 h-5" />,
      accent: "#4338ca",
      iconBg: "bg-indigo-100 text-indigo-700",
    },
  ];

  // ── Loading screen ────────────────────────────────────────────────────────

  if (isCheckingSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-red-700 to-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm text-gray-500">Checking session…</p>
        </div>
      </div>
    );
  }

  // ── Login page ────────────────────────────────────────────────────────────

  if (view === "login") {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo1.png"
              alt="Texas Premium Insurance Services"
              width={160}
              height={64}
              className="h-14 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 text-center mb-6">
            Admin Portal
          </h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Your username"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-red-700 to-blue-800 text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition mt-2"
            >
              Continue
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-5">
            Session expires at 11:59 PM daily
          </p>
        </div>
      </div>
    );
  }

  // ── Security Code step ────────────────────────────────────────────────────

  if (view === "security") {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <AnimatePresence>
          <motion.div
            key="security-card"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className="bg-slate-900 p-6 text-white text-center">
              <div className="w-12 h-12 bg-amber-400/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold">Security Verification</h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter today&apos;s security code to continue
              </p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <input
                type="password"
                inputMode="numeric"
                value={securityCode}
                onChange={(e) => {
                  setSecurityCode(
                    e.target.value.replace(/\D/g, "").slice(0, 4),
                  );
                  setSecurityError("");
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isVerifying && handleSecuritySubmit()
                }
                placeholder="• • • •"
                maxLength={4}
                autoFocus
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
              />

              {securityError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg text-center">
                  {securityError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleBackToLogin}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleSecuritySubmit}
                  disabled={securityCode.length !== 4 || isVerifying}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition text-sm disabled:opacity-40"
                >
                  {isVerifying ? "Verifying…" : "Verify"}
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Code changes daily — contact your manager if you don&apos;t have
                it
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-4 mb-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Image
              src="/logo1.png"
              alt="Texas Premium Insurance Services"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500">
                Welcome back,{" "}
                <span className="font-medium text-gray-700">
                  {sessionUsername}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium"
          >
            Logout
          </button>
        </div>

        {/* Primary grid */}
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 px-0.5">
          Daily tools
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {primaryCards.map((card) => (
            <button
              key={card.path}
              onClick={() => (window.location.href = card.path)}
              className="group bg-white border border-gray-100 rounded-2xl p-5 text-left hover:border-gray-200 hover:shadow-md transition-all duration-200 flex items-start gap-4"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.iconBg}`}
              >
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm mb-0.5">
                  {card.label}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {card.description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" />
            </button>
          ))}
        </div>

        {/* Secondary grid */}
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 px-0.5">
          Other tools
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {secondaryCards.map((card) => (
            <button
              key={card.path}
              onClick={() => (window.location.href = card.path)}
              className="group bg-white border border-gray-100 rounded-2xl p-5 text-left hover:border-gray-200 hover:shadow-md transition-all duration-200 flex items-start gap-4"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.iconBg}`}
              >
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm mb-0.5">
                  {card.label}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {card.description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
