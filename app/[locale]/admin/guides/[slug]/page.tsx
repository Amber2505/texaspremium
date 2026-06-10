"use client";

// Save as: app/[locale]/admin/guides/[slug]/page.tsx

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "../../_components/AdminShell";
import {
  ChevronLeft,
  BookOpen,
  Play,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";

const CATEGORY_STYLES: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  Payments: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  "Customer Files": {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  SMS: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  Documents: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
  },
  Autopay: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  General: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

interface Guide {
  slug: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  videoUrl: string;
  createdAt: string;
}

export default function AdminGuideViewerPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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
        return;
      }
      setIsCheckingAuth(false);
    } catch {
      localStorage.removeItem("admin_session");
      window.location.href = "/admin";
    }
  }, []);

  useEffect(() => {
    if (!slug || isCheckingAuth) return;
    fetch(`/api/guides/${slug}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.guide) setGuide(data.guide);
      })
      .finally(() => setLoading(false));
  }, [slug, isCheckingAuth]);

  if (isCheckingAuth || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound || !guide) {
    return (
      <AdminShell activePath="/admin/guides">
        <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium mb-4">
              Guide not found
            </p>
            <button
              onClick={() => (window.location.href = "/admin/guides")}
              className="text-xs text-[#A0103D] font-semibold hover:underline"
            >
              ← Back to all guides
            </button>
          </div>
        </div>
      </AdminShell>
    );
  }

  const s = CATEGORY_STYLES[guide.category] ?? CATEGORY_STYLES["General"];

  return (
    <AdminShell activePath="/admin/guides">
      <div className="min-h-screen bg-[#F5F4F1]">
        {/* ── Top nav bar ── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => (window.location.href = "/admin/guides")}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Guides
              </button>
              <span className="text-gray-200">/</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#A0103D] to-[#102a56] flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-800 max-w-xs truncate">
                  {guide.title}
                </span>
              </div>
            </div>

            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${s.bg} ${s.text}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {guide.category}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
          {/* ── Guide header card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 flex items-start gap-4 border-b border-gray-100">
              <div className="w-11 h-11 rounded-2xl bg-[#A0103D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Play className="w-5 h-5 text-[#A0103D] fill-[#A0103D]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  How-To Guide · Internal Use Only
                </p>
                <h1 className="text-lg font-bold text-gray-800 leading-snug">
                  {guide.title}
                </h1>
                {guide.description && (
                  <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                    {guide.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3">
                  {guide.duration && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" /> {guide.duration}
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${s.bg} ${s.text}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {guide.category}
                  </span>
                  <span className="text-xs text-gray-300">
                    Added{" "}
                    {new Date(guide.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
            {/* Red accent line */}
            <div className="h-0.5 bg-gradient-to-r from-[#A0103D] to-[#102a56]" />
          </div>

          {/* ── Video player ── */}
          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-black">
            <video
              src={guide.videoUrl}
              controls
              controlsList="nodownload"
              className="w-full block"
              style={{ maxHeight: "65vh", display: "block" }}
            >
              Your browser does not support video playback.
            </video>
          </div>

          <p className="text-center text-xs text-gray-300 pb-4">
            Texas Premium Insurance Services · Internal Use Only
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
