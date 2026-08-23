"use client";

import { useState, useEffect, ReactNode } from "react";

const UNLOCK_DURATION = 5 * 60 * 1000; // matches accounting

export default function CodeGate({
  title,
  subtitle = "Enter your access code to continue",
  storageKey,
  children,
}: {
  title: string;
  subtitle?: string;
  storageKey: string; // e.g. "reminder_unlocked_at"
  children: ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const at = sessionStorage.getItem(storageKey);
    if (at && Date.now() - parseInt(at) < UNLOCK_DURATION) setUnlocked(true);
    else sessionStorage.removeItem(storageKey);
    setChecking(false);
  }, [storageKey]);

  // Countdown + auto-lock
  useEffect(() => {
    if (!unlocked) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const at = sessionStorage.getItem(storageKey);
      if (!at) {
        setUnlocked(false);
        return;
      }
      const remaining = UNLOCK_DURATION - (Date.now() - parseInt(at));
      if (remaining <= 0) {
        sessionStorage.removeItem(storageKey);
        setUnlocked(false);
        setPinInput("");
        setPinError("");
        return;
      }
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [unlocked, storageKey]);

  const verify = async () => {
    if (!pinInput.trim()) return;
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/verify-accounting-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pinInput.trim() }),
      });
      if (res.ok) {
        sessionStorage.setItem(storageKey, String(Date.now()));
        setUnlocked(true);
      } else {
        setPinError("Incorrect code. Try again.");
        setPinInput("");
      }
    } catch {
      setPinError("Server error. Try again.");
    } finally {
      setPinLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 text-center mb-1">
            {title}
          </h2>
          <p className="text-sm text-gray-500 text-center mb-6">{subtitle}</p>
          <input
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="Enter code"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg tracking-widest focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none mb-3"
            autoFocus
          />
          {pinError && (
            <p className="text-sm text-red-500 text-center mb-3">{pinError}</p>
          )}
          <button
            onClick={verify}
            disabled={pinLoading || !pinInput.trim()}
            className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {pinLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying…
              </>
            ) : (
              "Unlock"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {secondsLeft !== null && (
        <div
          className={`fixed bottom-4 right-4 z-40 text-xs px-2.5 py-1.5 rounded-full font-mono font-semibold shadow-sm flex items-center gap-1 ${
            secondsLeft <= 60
              ? "bg-red-100 text-red-600"
              : "bg-emerald-100 text-emerald-700"
          }`}
          title="Time until this page re-locks"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, "0")}
        </div>
      )}
      {children}
    </>
  );
}
