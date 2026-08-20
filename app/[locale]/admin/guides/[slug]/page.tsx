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
  Pencil,
  Check,
  X,
} from "lucide-react";

const editInp =
  "w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A0103D]/20 focus:border-[#A0103D] transition";

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
  fileType?: "video" | "pdf" | "embed" | "pdf-steps";
  embedUrl?: string;
  createdAt: string;
  steps?: { title: string; description: string }[];
  pages?: { image: string; title: string; description: string }[];
  narratedVideoUrl?: string;
}

export default function AdminGuideViewerPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // ── Inline text editing ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Guide | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function startEdit() {
    if (!guide) return;
    setDraft(JSON.parse(JSON.stringify(guide)) as Guide);
    setSaveError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setSaveError("");
  }

  function updateField(field: "title" | "description", value: string) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  function updatePage(
    i: number,
    field: "title" | "description",
    value: string,
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            pages: (d.pages ?? []).map((p, idx) =>
              idx === i ? { ...p, [field]: value } : p,
            ),
          }
        : d,
    );
  }

  function updateStep(
    i: number,
    field: "title" | "description",
    value: string,
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            steps: (d.steps ?? []).map((st, idx) =>
              idx === i ? { ...st, [field]: value } : st,
            ),
          }
        : d,
    );
  }

  async function saveEdits() {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/guides/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          steps: draft.steps ?? [],
          // Only text is sent — image URLs stay server-side so a bad
          // payload can never wipe the rendered screenshots.
          pages: (draft.pages ?? []).map((p) => ({
            title: p.title,
            description: p.description,
          })),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Save failed (${res.status})`);
      }
      setGuide(draft);
      setEditing(false);
      setDraft(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

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
  // While editing, everything renders from the draft copy
  const view = editing && draft ? draft : guide;

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

            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition font-semibold disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#A0103D] to-[#102a56] text-white font-semibold hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-[#A0103D]/40 hover:text-[#A0103D] transition font-semibold"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Text
                </button>
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${s.bg} ${s.text}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {guide.category}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
          {saveError && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {saveError}
            </div>
          )}
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
                {editing ? (
                  <div className="space-y-2">
                    <input
                      className={`${editInp} text-base font-bold text-gray-900`}
                      value={view.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      placeholder="Guide title"
                    />
                    <input
                      className={`${editInp} text-gray-600`}
                      value={view.description ?? ""}
                      onChange={(e) =>
                        updateField("description", e.target.value)
                      }
                      placeholder="Short description"
                    />
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">
                      {view.title}
                    </h1>
                    {view.description && (
                      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                        {view.description}
                      </p>
                    )}
                  </>
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

          {/* ── Auto-generated narrated walkthrough video ── */}
          {guide.narratedVideoUrl && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-[#A0103D]/10 flex items-center justify-center">
                  <Play className="w-3 h-3 text-[#A0103D] fill-[#A0103D]" />
                </div>
                <h2 className="text-sm font-semibold text-gray-800">
                  Narrated Walkthrough
                </h2>
              </div>
              <video
                src={guide.narratedVideoUrl}
                controls
                controlsList="nodownload"
                className="w-full block"
                style={{ maxHeight: "65vh" }}
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {/* ── Rendered PDF step-images (clean, no guidemaker branding) ── */}
          {guide.fileType === "pdf-steps" &&
          guide.pages &&
          guide.pages.length > 0 ? (
            <div className="space-y-5">
              {(view.pages ?? []).map((pg, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <div className="px-6 py-4 flex items-start gap-4 border-b border-gray-100">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A0103D] to-[#102a56] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            className={`${editInp} font-semibold text-gray-900`}
                            value={pg.title}
                            onChange={(e) =>
                              updatePage(i, "title", e.target.value)
                            }
                            placeholder={`Step ${i + 1} title`}
                          />
                          <textarea
                            className={`${editInp} text-gray-600 resize-y`}
                            rows={2}
                            value={pg.description ?? ""}
                            onChange={(e) =>
                              updatePage(i, "description", e.target.value)
                            }
                            placeholder="Description (optional)"
                          />
                        </div>
                      ) : (
                        <>
                          <p className="text-[17px] font-bold text-gray-900 leading-snug">
                            {pg.title}
                          </p>
                          {pg.description && (
                            <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                              {pg.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pg.image}
                    alt={`Step ${i + 1}: ${pg.title}`}
                    className="w-full block"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            /* ── Embed / Video / PDF viewer ── */
            <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              {guide.fileType === "embed" || guide.embedUrl ? (
                <iframe
                  src={guide.embedUrl || guide.videoUrl}
                  sandbox="allow-scripts allow-top-navigation-by-user-activation allow-popups allow-same-origin"
                  title={guide.title}
                  width="100%"
                  height="500px"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="block w-full border-0"
                />
              ) : guide.fileType === "pdf" ? (
                <iframe
                  src={guide.videoUrl}
                  className="w-full block border-0"
                  style={{ height: "70vh" }}
                  title={guide.title}
                />
              ) : (
                <video
                  src={guide.videoUrl}
                  controls
                  controlsList="nodownload"
                  className="w-full block"
                  style={{ maxHeight: "65vh", display: "block" }}
                >
                  Your browser does not support video playback.
                </video>
              )}
            </div>
          )}

          {/* ── Steps ── */}
          {guide.fileType !== "pdf-steps" &&
            guide.steps &&
            guide.steps.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-lg bg-[#A0103D]/10 flex items-center justify-center">
                    <Play className="w-3 h-3 text-[#A0103D] fill-[#A0103D]" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">
                    Step-by-Step Instructions
                  </h2>
                  <span className="text-xs text-gray-400 ml-1">
                    · {guide.steps.length} steps
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(view.steps ?? []).map((step, i) => (
                    <div
                      key={i}
                      className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A0103D] to-[#102a56] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editing ? (
                          <div className="space-y-2">
                            <input
                              className={`${editInp} font-semibold text-gray-900`}
                              value={step.title}
                              onChange={(e) =>
                                updateStep(i, "title", e.target.value)
                              }
                              placeholder={`Step ${i + 1} title`}
                            />
                            <textarea
                              className={`${editInp} text-gray-600 resize-y`}
                              rows={2}
                              value={step.description ?? ""}
                              onChange={(e) =>
                                updateStep(i, "description", e.target.value)
                              }
                              placeholder="Description (optional)"
                            />
                          </div>
                        ) : (
                          <>
                            <p className="text-[17px] font-bold text-gray-900 leading-snug">
                              {step.title}
                            </p>
                            {step.description && (
                              <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                                {step.description}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <p className="text-center text-xs text-gray-300 pb-4">
            Texas Premium Insurance Services · Internal Use Only
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
