// app/[locale]/admin/guides/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import AdminShell from "../_components/AdminShell";
import {
  BookOpen,
  Search,
  Upload,
  X,
  Loader2,
  ChevronLeft,
  Play,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  PlusCircle,
} from "lucide-react";

const CATEGORIES = [
  "Payments",
  "Customer Files",
  "SMS",
  "Documents",
  "Autopay",
  "General",
];

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

// Simple fuzzy match — returns true if all query chars appear in order in target
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function scoreGuide(query: string, guide: Guide): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const haystack =
    `${guide.title} ${guide.category} ${guide.description}`.toLowerCase();
  // Exact substring = highest score
  if (haystack.includes(q)) return 3;
  // All words present = medium
  const words = q.split(/\s+/);
  if (words.every((w) => haystack.includes(w))) return 2;
  // Fuzzy = lowest pass
  if (fuzzyMatch(q, haystack)) return 1;
  return 0;
}

const inp =
  "w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A0103D]/20 focus:border-[#A0103D] transition placeholder-gray-300";

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    slug: string;
    title: string;
  } | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "General",
    duration: "",
    embedUrl: "",
  });
  const [steps, setSteps] = useState<{ title: string; description: string }[]>(
    [],
  );
  const [extracting, setExtracting] = useState(false);

  async function extractStepsFromPdf(file: File) {
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch("/api/guides/extract-steps", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.steps) setSteps(data.steps);
      else setError("Could not extract steps from PDF.");
    } catch {
      setError("Step extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function addStep() {
    setSteps((s) => [...s, { title: "", description: "" }]);
  }
  function updateStep(
    i: number,
    field: "title" | "description",
    value: string,
  ) {
    setSteps((s) =>
      s.map((step, idx) => (idx === i ? { ...step, [field]: value } : step)),
    );
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i));
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

  async function fetchGuides() {
    setLoading(true);
    try {
      const res = await fetch("/api/guides");
      const data = await res.json();
      setGuides(data.guides ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isCheckingAuth) fetchGuides();
  }, [isCheckingAuth]);

  // ── Filtered + scored results ──────────────────────────────────────────────
  const filtered = guides
    .filter((g) => activeCategory === "All" || g.category === activeCategory)
    .map((g) => ({ guide: g, score: scoreGuide(search, g) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ guide }) => guide);

  // Category counts for filter pills
  const categoryCounts = guides.reduce<Record<string, number>>((acc, g) => {
    acc[g.category] = (acc[g.category] ?? 0) + 1;
    return acc;
  }, {});

  async function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!selectedFile && !form.embedUrl.trim()) {
      setError("Please select a file or provide an embed URL.");
      return;
    }
    setUploading(true);
    setError("");

    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("category", form.category);
      fd.append("duration", form.duration);
      fd.append("steps", JSON.stringify(steps));
      fd.append("embedUrl", form.embedUrl);
      if (selectedFile) {
        const isPdf = selectedFile.name.toLowerCase().endsWith(".pdf");
        fd.append(isPdf ? "pdf" : "video", selectedFile);
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/guides");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(
              new Error(JSON.parse(xhr.responseText).error ?? "Upload failed."),
            );
        };
        xhr.onerror = () => reject(new Error("Network error."));
        xhr.send(fd);
      });

      setShowForm(false);
      setForm({
        title: "",
        description: "",
        category: "General",
        duration: "",
        embedUrl: "",
      });
      setSteps([]);
      setForm((f) => ({ ...f, embedUrl: "" }));
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setSuccessMsg("Guide uploaded successfully.");
      setTimeout(() => setSuccessMsg(""), 4000);
      fetchGuides();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  function handleDelete(slug: string, title: string) {
    setDeleteTarget({ slug, title });
    setDeleteCode("");
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingSlug(deleteTarget.slug);
    setDeleteError("");
    const res = await fetch(
      `/api/guides/${deleteTarget.slug}?code=${encodeURIComponent(deleteCode)}`,
      { method: "DELETE" },
    );
    if (res.status === 403) {
      setDeleteError("Incorrect code. Try again.");
      setDeletingSlug(null);
      return;
    }
    setDeleteTarget(null);
    setDeleteCode("");
    setDeletingSlug(null);
    fetchGuides();
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const catStyle = (cat: string) =>
    CATEGORY_STYLES[cat] ?? CATEGORY_STYLES["General"];

  return (
    <AdminShell activePath="/admin/guides">
      <div className="min-h-screen bg-[#F5F4F1]">
        {/* ── Top nav bar — matches PDF Merger exactly ── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => (window.location.href = "/admin")}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Admin
              </button>
              <span className="text-gray-200">/</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#A0103D] to-[#102a56] flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  Staff Guides
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setShowForm(true);
                setError("");
              }}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#A0103D] to-[#102a56] text-white font-semibold hover:opacity-90 transition"
            >
              <PlusCircle className="w-4 h-4" /> Upload Guide
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Toast messages */}
          {successMsg && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {successMsg}
            </div>
          )}
          {error && !showForm && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── Upload form ── */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-gray-800">
                  Upload New Guide
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-300 hover:text-gray-500 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* File picker */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Video File{" "}
                    <span className="text-rose-400 normal-case">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={`w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-2xl transition-all text-center ${
                      selectedFile
                        ? "border-[#A0103D] bg-rose-50"
                        : "border-gray-200 hover:border-[#A0103D]/40 hover:bg-rose-50/30"
                    }`}
                  >
                    {selectedFile ? (
                      <>
                        <div className="w-10 h-10 rounded-2xl bg-[#A0103D]/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-[#A0103D]" />
                        </div>
                        <p className="text-sm font-semibold text-[#A0103D]">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-[#A0103D]/60">
                          {(selectedFile.size / 1024 / 1024).toFixed(1)} MB ·
                          click to change
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <Upload className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-500">
                          Click to select a file
                        </p>
                        <p className="text-xs text-gray-400">
                          MP4, MOV, WebM or PDF
                        </p>
                      </>
                    )}
                  </button>
                  {selectedFile?.name.toLowerCase().endsWith(".pdf") &&
                    steps.length === 0 && (
                      <button
                        type="button"
                        onClick={() => extractStepsFromPdf(selectedFile)}
                        disabled={extracting}
                        className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-[#A0103D] to-[#102a56] text-white text-xs font-semibold hover:opacity-90 transition disabled:opacity-60"
                      >
                        {extracting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                            Extracting steps with AI…
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" /> Auto-Extract Steps
                            with AI
                          </>
                        )}
                      </button>
                    )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                      setSteps([]);
                    }}
                  />
                </div>

                {/* Title */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Title <span className="text-rose-400 normal-case">*</span>
                  </label>
                  <input
                    className={inp}
                    placeholder="How To Create a Custom Payment Link"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Description
                  </label>
                  <input
                    className={inp}
                    placeholder="Short description of what this guide covers"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => {
                      const selected = form.category === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, category: c }))
                          }
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                            selected
                              ? "bg-[#102a56] border-[#102a56] text-white"
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {selected && (
                            <div
                              className={`w-1.5 h-1.5 rounded-full bg-white`}
                            />
                          )}
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Duration{" "}
                    <span className="text-gray-300 normal-case font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    className={inp}
                    placeholder="~2 min"
                    value={form.duration}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, duration: e.target.value }))
                    }
                  />
                </div>

                {/* Embed URL */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Embed URL{" "}
                    <span className="text-gray-300 normal-case font-normal">
                      (optional — paste MagicHow/Loom/YouTube embed src)
                    </span>
                  </label>
                  <input
                    className={inp}
                    placeholder="https://www.magichow.co/embed/..."
                    value={form.embedUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, embedUrl: e.target.value }))
                    }
                  />
                  {form.embedUrl && (
                    <p className="text-[10px] text-emerald-600 mt-1">
                      ✓ Embed URL set — file upload is optional when using an
                      embed
                    </p>
                  )}
                </div>

                {/* Steps editor */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Steps{" "}
                      <span className="text-gray-300 normal-case font-normal">
                        (optional)
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={addStep}
                      className="flex items-center gap-1 text-xs font-semibold text-[#A0103D] hover:opacity-80 transition"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Step
                    </button>
                  </div>
                  {steps.length === 0 && (
                    <p className="text-xs text-gray-300 italic">
                      No steps yet — click Add Step to guide staff through this
                      process.
                    </p>
                  )}
                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <div
                        key={i}
                        className="flex gap-3 items-start bg-gray-50 rounded-xl p-3 border border-gray-100"
                      >
                        <div className="w-6 h-6 rounded-full bg-[#102a56] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                          {i + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            className={inp}
                            placeholder={`Step ${i + 1} title (e.g. Click on Payment Links)`}
                            value={step.title}
                            onChange={(e) =>
                              updateStep(i, "title", e.target.value)
                            }
                          />
                          <input
                            className={inp}
                            placeholder="Description (optional)"
                            value={step.description}
                            onChange={(e) =>
                              updateStep(i, "description", e.target.value)
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStep(i)}
                          className="text-gray-300 hover:text-rose-500 transition mt-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Uploading to Azure…</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#A0103D] to-[#102a56] rounded-full transition-all duration-200"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 mt-4 text-sm text-rose-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-5 pt-5 border-t border-gray-100">
                <button
                  onClick={() => setShowForm(false)}
                  disabled={uploading}
                  className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={uploading}
                  className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg bg-gradient-to-r from-[#A0103D] to-[#102a56] text-white font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading{" "}
                      {uploadPct}%…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" /> Save Guide
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Search + filters ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search box */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A0103D]/20 focus:border-[#A0103D] transition placeholder-gray-300"
                  placeholder="Search guides — try 'payment', 'SMS', 'autopay'…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  "All",
                  ...CATEGORIES.filter((c) => categoryCounts[c] > 0),
                ].map((cat) => {
                  const active = activeCategory === cat;
                  const s = cat !== "All" ? catStyle(cat) : null;
                  const count =
                    cat === "All" ? guides.length : (categoryCounts[cat] ?? 0);
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        active
                          ? "bg-[#102a56] border-[#102a56] text-white"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {s && active && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                      {cat}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search result hint */}
            {search && (
              <p className="text-xs text-gray-400 mt-2.5 px-1">
                {filtered.length === 0
                  ? `No guides match "${search}"`
                  : `${filtered.length} guide${filtered.length !== 1 ? "s" : ""} match "${search}"`}
              </p>
            )}
          </div>

          {/* ── Guide cards ── */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500 mb-1">
                {search ? `No guides match "${search}"` : "No guides yet"}
              </p>
              <p className="text-xs text-gray-400">
                {search
                  ? "Try a different search term"
                  : "Click 'Upload Guide' to add your first one."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((g) => {
                const s = catStyle(g.category);
                return (
                  <div
                    key={g.slug}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-200 transition group"
                  >
                    {/* Thumbnail / play banner */}
                    <div
                      className="relative h-32 bg-gradient-to-br from-[#102a56] to-[#1a3a6e] flex items-center justify-center cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/admin/guides/${g.slug}`)
                      }
                    >
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                      {/* Category badge top-left */}
                      <div
                        className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${s.bg} ${s.text}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {g.category}
                      </div>
                      {/* Duration top-right */}
                      {g.duration && (
                        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/30 text-[10px] font-semibold text-white">
                          <Clock className="w-3 h-3" />
                          {g.duration}
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <h3 className="text-sm font-semibold text-gray-800 leading-snug mb-1.5 line-clamp-2">
                        {g.title}
                      </h3>
                      {g.description && (
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-4">
                          {g.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                        <span className="text-[10px] text-gray-300">
                          {new Date(g.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(g.slug, g.title)}
                            disabled={deletingSlug === g.slug}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-200 hover:text-rose-500 hover:bg-rose-50 transition"
                            title="Delete guide"
                          >
                            {deletingSlug === g.slug ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              (window.location.href = `/admin/guides/${g.slug}`)
                            }
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-[#A0103D] to-[#102a56] px-3 py-1.5 rounded-lg hover:opacity-90 transition"
                          >
                            <Play className="w-3 h-3" /> Watch
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          {!loading && guides.length > 0 && (
            <p className="text-center text-xs text-gray-300 pb-4">
              {guides.length} guide{guides.length !== 1 ? "s" : ""} · Texas
              Premium Insurance Services · Internal Use Only
            </p>
          )}
        </div>
      </div>
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Delete Guide
                </p>
                <p className="text-xs text-gray-400 line-clamp-1">
                  &ldquo;{deleteTarget.title}&ldquo;
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Enter the admin delete code to confirm. This cannot be undone.
            </p>
            <input
              type="password"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition placeholder-gray-300 mb-2"
              placeholder="Enter delete code"
              value={deleteCode}
              onChange={(e) => {
                setDeleteCode(e.target.value);
                setDeleteError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
              autoFocus
            />
            {deleteError && (
              <p className="text-xs text-rose-600 flex items-center gap-1 mb-2">
                <AlertCircle className="w-3.5 h-3.5" /> {deleteError}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteCode("");
                  setDeleteError("");
                }}
                disabled={!!deletingSlug}
                className="flex-1 text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!deleteCode || !!deletingSlug}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingSlug ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
