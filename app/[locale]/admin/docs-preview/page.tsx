// app/[locale]/admin/docs-preview/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, Loader2, Shield } from "lucide-react";
import AdminShell from "../_components/AdminShell";

export default function DocsPreviewPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale === "es" ? "es" : "en";

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [searchType, setSearchType] = useState<"phone" | "policy">("phone");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const digits = value.replace(/\D/g, "");
  const canSubmit =
    !loading &&
    code.length === 4 &&
    (searchType === "phone" ? digits.length === 10 : value.trim().length >= 5);

  const openPreview = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/docs-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          securityCode: code,
          searchType,
          searchValue: value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't open the preview.");

      // /view_documents restores a session from these on load
      sessionStorage.setItem("docsToken", data.token);
      sessionStorage.setItem(
        "docsTokenExp",
        String(new Date(data.expires_at).getTime()),
      );
      window.location.href = `/${locale}/view_documents`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the preview.");
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <AdminShell activePath="/admin/docs-preview">
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-red-700 to-blue-800 flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Preview Customer Documents
            </h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Opens the document portal exactly as the customer sees it. No code
            is sent to the customer.
          </p>

          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Search by
          </label>
          <div className="flex gap-2 mb-4">
            {(["phone", "policy"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setSearchType(t);
                  setValue("");
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                  searchType === t
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {t === "phone" ? "Phone" : "Policy #"}
              </button>
            ))}
          </div>

          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              searchType === "phone" ? "(469) 555-1234" : "TXA2612M000161"
            }
            inputMode={searchType === "phone" ? "numeric" : "text"}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />

          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            <span className="inline-flex items-center gap-1">
              <Shield className="w-3 h-3" /> Today&apos;s security code
            </span>
          </label>
          <input
            type="password"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            onKeyDown={(e) => e.key === "Enter" && canSubmit && openPreview()}
            placeholder="4-digit code"
            inputMode="numeric"
            autoComplete="off"
            className="w-full px-3.5 py-2.5 text-center text-lg font-mono tracking-[0.5em] border border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <button
            onClick={openPreview}
            disabled={!canSubmit}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-red-700 to-blue-800 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Opening…
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> Open as customer
              </>
            )}
          </button>

          <p className="text-[11px] text-gray-400 mt-4 text-center">
            The preview lasts 30 minutes. Click &quot;Sign out&quot; on the
            portal when you&apos;re done.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
