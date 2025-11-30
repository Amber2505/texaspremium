// /admin/page

"use client";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Users, Calendar, Shield } from "lucide-react";

const ADMIN_PASSWORD = "Insurance2024";
const SESSION_KEY = "admin_session";

interface AdminSession {
  username: string;
  loginTime: number;
  expiresAt: number;
}

export default function AdminLoginPage() {
  const [view, setView] = useState<"login" | "dashboard">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);

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
      999
    );
    return endOfDay.getTime();
  };

  const checkExistingSession = () => {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const session: AdminSession = JSON.parse(savedSession);
        const now = Date.now();

        if (now < session.expiresAt) {
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

    const session: AdminSession = {
      username: username.trim(),
      loginTime: Date.now(),
      expiresAt: getEndOfDayTimestamp(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUsername("");
    setPassword("");
    setView("login");
  };

  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  if (isCheckingSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600">Checking session...</p>
        </div>
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Admin Portal</h1>
            <p className="text-gray-600 mt-2">
              Texas Premium Insurance Services
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                placeholder="Enter your username"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-red-700 to-blue-800 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Sign In
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-6">
            Session expires at 11:59 PM daily
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 mt-1">
                Welcome back, <span className="font-semibold">{username}</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => navigateTo("/admin/live-chat")}
            className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 p-8 text-left border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Live Chat</h2>
                <p className="text-gray-600 text-sm">
                  Manage customer conversations
                </p>
              </div>
            </div>
            <p className="text-gray-600">
              Access the live chat dashboard to respond to customer inquiries,
              manage chat sessions, and view conversation history.
            </p>
            <div className="mt-4 flex items-center text-blue-600 font-medium group-hover:translate-x-2 transition-transform">
              Open Live Chat →
            </div>
          </button>

          <button
            onClick={() => navigateTo("/admin/reminder")}
            className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 p-8 text-left border-2 border-transparent hover:border-green-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-r from-green-600 to-green-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Reminders</h2>
                <p className="text-gray-600 text-sm">Track payment schedules</p>
              </div>
            </div>
            <p className="text-gray-600">
              Monitor customer payment reminders, follow-up schedules, and
              manage insurance renewal notifications.
            </p>
            <div className="mt-4 flex items-center text-green-600 font-medium group-hover:translate-x-2 transition-transform">
              Open Reminders →
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
