// app/[locale]/docs/[token]/page.tsx
// Customer-facing document upload page. Link: /{en|es}/docs/{token}
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Plus,
  Upload,
  AlertCircle,
  Clock,
} from "lucide-react";

// ─── Types (mirror toPublic in lib/documentRequests) ─────────────────────────
interface PubFile {
  id: string;
  originalName: string;
  uploadedAt: string;
}
interface PubSlot {
  key: string;
  labelEn: string;
  labelEs: string;
  hintEn?: string;
  hintEs?: string;
  guideImage?: string;
  single: boolean;
  imagesOnly: boolean;
  files: PubFile[];
}
interface PubItem {
  id: string;
  type: string;
  labelEn: string;
  labelEs: string;
  hintEn?: string;
  hintEs?: string;
  locked: boolean;
  slots: PubSlot[];
}
interface PubRequest {
  customerName: string;
  language: "en" | "es";
  expiresAt: string;
  expired: boolean;
  items: PubItem[];
}

// ─── Copy ────────────────────────────────────────────────────────────────────
const T = {
  en: {
    title: "Upload Your Documents",
    hi: (n: string) => (n ? `Hi ${n},` : "Hi,"),
    intro:
      "To complete your policy, please upload the documents below as soon as possible. This link closes on",
    progress: (d: number, t: number) => `${d} of ${t} done`,
    upload: "Upload",
    add: "Add another",
    replace: "Retake",
    uploading: "Uploading…",
    uploaded: "Received",
    fromPhone: "Take a photo or choose a file",
    photosOnly: "Photo",
    photoOrPdf: "Photo or PDF",
    lockedNote: "Reviewed by your agent",
    tips: "Take photos in daylight, no glare, whole vehicle in frame.",
    doneTitle: "Received!",
    doneBody:
      "Thank you. An agent will review your documents and get back to you.",
    doneMore: "You can still add files below if you need to.",
    expiredTitle: "This link has expired",
    expiredBody:
      "Please call us at (469) 729-5185 and we'll send you a new one.",
    notFoundTitle: "Link not found",
    notFoundBody: "Please check the link or call us at (469) 729-5185.",
    errTooLarge:
      "That file is too large. Please try a smaller photo or PDF (max 4 MB).",
    errType: "Please upload a photo or a PDF.",
    errPhotoOnly: "Please upload a photo for this one.",
    errTooMany: "You've reached the maximum number of files here.",
    errGeneric: "Upload failed. Please check your connection and try again.",
    remove: "Remove",
    help: "Questions? Call (469) 729-5185",
    continueBtn: "Continue",
    laterBtn: "I'll upload the rest later",
    laterNote:
      "No problem. We'll text you this link. Please upload the rest as soon as possible.",
  },
  es: {
    title: "Suba Sus Documentos",
    hi: (n: string) => (n ? `Hola ${n},` : "Hola,"),
    intro:
      "Para completar su póliza, por favor suba los documentos a continuación lo antes posible. Este enlace vence el",
    progress: (d: number, t: number) => `${d} de ${t} listos`,
    upload: "Subir",
    add: "Agregar otro",
    replace: "Volver a tomar",
    uploading: "Subiendo…",
    uploaded: "Recibido",
    fromPhone: "Tome una foto o elija un archivo",
    photosOnly: "Foto",
    photoOrPdf: "Foto o PDF",
    lockedNote: "Revisado por su agente",
    tips: "Tome las fotos con buena luz, sin reflejos, con todo el vehículo visible.",
    doneTitle: "¡Recibido!",
    doneBody:
      "Gracias. Un agente revisará sus documentos y se comunicará con usted.",
    doneMore: "Todavía puede agregar archivos abajo si lo necesita.",
    expiredTitle: "Este enlace ha vencido",
    expiredBody:
      "Por favor llámenos al (469) 729-5185 y le enviaremos uno nuevo.",
    notFoundTitle: "Enlace no encontrado",
    notFoundBody: "Por favor revise el enlace o llámenos al (469) 729-5185.",
    errTooLarge:
      "El archivo es muy grande. Intente con una foto o PDF más pequeño (máx. 4 MB).",
    errType: "Por favor suba una foto o un PDF.",
    errPhotoOnly: "Por favor suba una foto para este.",
    errTooMany: "Llegó al número máximo de archivos aquí.",
    errGeneric: "No se pudo subir. Revise su conexión e intente de nuevo.",
    remove: "Quitar",
    help: "¿Preguntas? Llame al (469) 729-5185",
    continueBtn: "Continuar",
    laterBtn: "Subiré el resto más tarde",
    laterNote:
      "No hay problema. Le enviaremos este enlace por mensaje de texto. Por favor suba el resto lo antes posible.",
  },
};

const MAX_BYTES = 4.3 * 1024 * 1024;

// Phone photos are 4–8 MB; shrink to ≤2000px JPEG before upload.
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.82),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it — send as-is
  }
}

const slotDone = (s: PubSlot) => s.files.length > 0;
const itemDone = (i: PubItem) => i.slots.every(slotDone);

// Defined outside the page so a state change doesn't remount the whole tree
function Shell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg,#f0f2f5 0%,#e8eaef 50%,#f5f0f2 100%)",
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg,#1E3A5F 0%,#2B4C7E 40%,#6B1D3A 80%,#8B1A3D 100%)",
        }}
      >
        <div className="relative max-w-2xl mx-auto px-4 py-7 text-center">
          <h1 className="text-xl font-bold text-white tracking-wide uppercase">
            {heading}
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-2 text-white/50 text-xs">
            <Lock className="w-3 h-3" /> Texas Premium Insurance Services
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 -mt-3 pb-12 relative z-10">
        {children}
      </div>
    </div>
  );
}

function Notice({
  heading,
  title,
  body,
}: {
  heading: string;
  title: string;
  body: string;
}) {
  return (
    <Shell heading={heading}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-[#8B1A3D] mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>
        <p className="text-sm text-gray-600">{body}</p>
      </div>
    </Shell>
  );
}

export default function DocumentUploadPage() {
  const params = useParams();
  const token = params.token as string;
  const lang: "en" | "es" = params.locale === "es" ? "es" : "en";
  const t = T[lang];
  const L = (en?: string, es?: string) => (lang === "es" ? es : en) || "";

  const [req, setReq] = useState<PubRequest | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "notfound" | "error"
  >("loading");
  const [busy, setBusy] = useState<string | null>(null); // "itemId:slot"
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({}); // fileId → object URL (this session only)
  const inputRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ item: PubItem; slot: PubSlot } | null>(null);

  // Opened from the payment-link flow (?linkId=…): show Continue / Later
  const [fromPayment, setFromPayment] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    setFromPayment(new URLSearchParams(window.location.search).has("linkId"));
  }, []);

  const finishStep = async (later: boolean) => {
    setLeaving(true);
    try {
      await fetch(`/api/docs/${token}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ later }),
      });
    } catch {
      // Still move on — reminders cover anything missed
    }
    window.location.href = `/${lang}/payment-thankyou`;
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${token}`, { cache: "no-store" });
      if (res.status === 404) return setState("notfound");
      const data = await res.json();
      if (!data.success) return setState("error");
      setReq(data.request);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Free the local thumbnails only when leaving the page
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(
    () => () =>
      Object.values(previewsRef.current).forEach((u) => URL.revokeObjectURL(u)),
    [],
  );

  const pick = (item: PubItem, slot: PubSlot) => {
    target.current = { item, slot };
    if (inputRef.current) {
      inputRef.current.accept = slot.imagesOnly
        ? "image/*"
        : "image/*,application/pdf";
      inputRef.current.multiple = !slot.single;
      inputRef.current.value = "";
      inputRef.current.click();
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    const tgt = target.current;
    if (!files?.length || !tgt) return;
    const key = `${tgt.item.id}:${tgt.slot.key}`;
    setErrors((e) => ({ ...e, [key]: "" }));
    setBusy(key);

    const list = tgt.slot.single ? [files[0]] : Array.from(files);
    try {
      for (const original of list) {
        const isPdf = original.type === "application/pdf";
        if (!original.type.startsWith("image/") && !isPdf)
          throw new Error(t.errType);
        if (isPdf && tgt.slot.imagesOnly) throw new Error(t.errPhotoOnly);

        const blob = isPdf ? original : await compressImage(original);
        if (blob.size > MAX_BYTES) throw new Error(t.errTooLarge);

        const name =
          blob === original
            ? original.name
            : original.name.replace(/\.[^.]+$/, "") + ".jpg";
        const form = new FormData();
        form.append("itemId", tgt.item.id);
        form.append("slot", tgt.slot.key);
        form.append("file", blob, name);

        const res = await fetch(`/api/docs/${token}/upload`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 410) return load(); // just expired → page shows the expired card
          throw new Error(
            data.error === "too_large" || res.status === 413
              ? t.errTooLarge
              : data.error === "bad_type"
                ? t.errType
                : data.error === "too_many"
                  ? t.errTooMany
                  : t.errGeneric,
          );
        }
        const next: PubRequest = data.request;
        // Keep a local thumbnail for what was just uploaded
        if (!isPdf) {
          const s = next.items
            .find((i) => i.id === tgt.item.id)
            ?.slots.find((x) => x.key === tgt.slot.key);
          const newest = s?.files[s.files.length - 1];
          if (newest)
            setPreviews((p) => ({
              ...p,
              [newest.id]: URL.createObjectURL(blob),
            }));
        }
        setReq(next);
      }
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message || t.errGeneric }));
    } finally {
      setBusy(null);
    }
  };

  const removeFile = async (item: PubItem, slot: PubSlot, fileId: string) => {
    const key = `${item.id}:${slot.key}`;
    setBusy(key);
    try {
      const res = await fetch(`/api/docs/${token}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, slot: slot.key, fileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.request) setReq(data.request);
    } finally {
      setBusy(null);
    }
  };

  // ─── Shell states ──────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Image
          src="/logo.png"
          alt="Texas Premium Insurance Services"
          width={160}
          height={64}
          className="mb-8"
        />
        <Loader2 className="w-8 h-8 animate-spin text-[#1E3A5F]" />
      </div>
    );
  }

  if (state === "notfound" || state === "error" || !req)
    return (
      <Notice title={t.notFoundTitle} body={t.notFoundBody} heading={t.title} />
    );
  if (req.expired)
    return (
      <Notice title={t.expiredTitle} body={t.expiredBody} heading={t.title} />
    );

  const total = req.items.length;
  const done = req.items.filter(itemDone).length;
  const allDone = done === total;
  const until = new Date(req.expiresAt).toLocaleDateString(
    lang === "es" ? "es-US" : "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "America/Chicago",
    },
  );

  // ─── Main ──────────────────────────────────────────────────────────────────
  return (
    <Shell heading={t.title}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />

      {/* Intro + progress */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
        <p className="text-sm font-semibold text-gray-900">
          {t.hi(req.customerName)}
        </p>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed">
          {t.intro} <strong className="text-gray-800">{until}</strong>.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="text-gray-500">{t.progress(done, total)}</span>
            <span className="text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {until}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(done / total) * 100}%`,
                background: "linear-gradient(90deg,#1E3A5F,#8B1A3D)",
              }}
            />
          </div>
        </div>
      </div>

      {allDone && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4 flex gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-900">{t.doneTitle}</p>
            <p className="text-sm text-emerald-800 mt-0.5">{t.doneBody}</p>
            <p className="text-xs text-emerald-700/80 mt-1">{t.doneMore}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {req.items.map((item) => {
          const complete = itemDone(item);
          const isVehicle = item.type === "vehicle";
          return (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div
                className={`px-5 py-4 flex items-start gap-3 border-b ${complete ? "bg-emerald-50/60 border-emerald-100" : "border-gray-100"}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${complete ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}
                >
                  {complete ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isVehicle ? (
                    <Camera className="w-4 h-4" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">
                    {L(item.labelEn, item.labelEs)}
                  </p>
                  {L(item.hintEn, item.hintEs) && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {L(item.hintEn, item.hintEs)}
                    </p>
                  )}
                  {item.locked && (
                    <p className="text-[11px] font-semibold text-emerald-700 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      {t.lockedNote}
                    </p>
                  )}
                </div>
                {complete && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    {t.uploaded}
                  </span>
                )}
              </div>

              <div
                className={
                  isVehicle ? "p-4 grid grid-cols-2 gap-3" : "p-4 space-y-4"
                }
              >
                {item.slots.map((slot) => {
                  const key = `${item.id}:${slot.key}`;
                  const isBusy = busy === key;
                  const err = errors[key];

                  // Vehicle: one photo tile per angle, example image until uploaded
                  if (isVehicle) {
                    const f = slot.files[0];
                    const preview = f ? previews[f.id] : undefined;
                    return (
                      <div key={slot.key}>
                        <button
                          type="button"
                          disabled={isBusy || item.locked || !!f}
                          onClick={() => pick(item, slot)}
                          className={`relative w-full aspect-[4/3] rounded-lg border-2 overflow-hidden flex items-center justify-center transition ${
                            f
                              ? "border-emerald-400 cursor-default"
                              : "border-dashed border-gray-300 hover:border-[#1E3A5F]"
                          }`}
                        >
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : slot.guideImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slot.guideImage}
                              alt=""
                              className={`absolute inset-0 w-full h-full object-contain p-2 ${f ? "opacity-30" : "opacity-60"}`}
                            />
                          ) : null}
                          <span
                            className={`relative z-10 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                              f
                                ? "bg-emerald-500 text-white"
                                : "bg-[#1E3A5F] text-white"
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : f ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Camera className="w-3 h-3" />
                            )}
                            {isBusy ? t.uploading : f ? t.uploaded : t.upload}
                          </span>
                        </button>
                        <p className="text-xs font-semibold text-gray-700 mt-1.5">
                          {L(slot.labelEn, slot.labelEs)}
                        </p>
                        {L(slot.hintEn, slot.hintEs) && (
                          <p className="text-[10px] text-gray-400 leading-snug">
                            {L(slot.hintEn, slot.hintEs)}
                          </p>
                        )}
                        {err && (
                          <p className="text-[11px] text-red-600 mt-1">{err}</p>
                        )}
                      </div>
                    );
                  }

                  // Everything else: list of files + add button
                  const showSlotLabel = item.slots.length > 1;
                  return (
                    <div key={slot.key}>
                      {showSlotLabel && (
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                          {L(slot.labelEn, slot.labelEs)}
                        </p>
                      )}
                      {slot.files.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {slot.files.map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center gap-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg"
                            >
                              {previews[f.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={previews[f.id]}
                                  alt=""
                                  className="w-9 h-9 rounded object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-emerald-600" />
                                </div>
                              )}
                              <p className="text-xs font-medium text-emerald-900 truncate flex-1">
                                {f.originalName}
                              </p>{" "}
                            </div>
                          ))}
                        </div>
                      )}
                      {!item.locked && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => pick(item, slot)}
                          className={`w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed transition ${
                            slot.files.length
                              ? "py-2.5 border-gray-200 text-gray-500 hover:border-[#1E3A5F] text-sm"
                              : "py-6 border-gray-300 text-[#1E3A5F] hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5"
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : slot.files.length ? (
                            <Plus className="w-4 h-4" />
                          ) : (
                            <Upload className="w-5 h-5" />
                          )}
                          <span className="font-semibold text-sm">
                            {isBusy
                              ? t.uploading
                              : slot.files.length
                                ? t.add
                                : t.upload}
                          </span>
                          {!slot.files.length && !isBusy && (
                            <span className="text-xs text-gray-400 font-normal">
                              · {slot.imagesOnly ? t.photosOnly : t.photoOrPdf}
                            </span>
                          )}
                        </button>
                      )}
                      {err && (
                        <p className="text-[11px] text-red-600 mt-1">{err}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {isVehicle && (
                <p className="px-4 pb-4 -mt-1 text-[11px] text-gray-500">
                  {t.tips}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {fromPayment && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-4">
          {!allDone && (
            <p className="text-xs text-gray-500 mb-3 text-center">
              {t.laterNote}
            </p>
          )}
          <button
            type="button"
            disabled={leaving || !!busy}
            onClick={() => finishStep(!allDone)}
            className={`w-full py-3.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60 ${
              allDone
                ? "text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            style={
              allDone
                ? {
                    background:
                      "linear-gradient(135deg,#1E3A5F 0%,#2B4C7E 40%,#6B1D3A 80%,#8B1A3D 100%)",
                  }
                : undefined
            }
          >
            {leaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {allDone ? t.continueBtn : t.laterBtn}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-6">{t.help}</p>
      <p className="text-center text-xs text-gray-400 mt-1">
        &copy; {new Date().getFullYear()} Texas Premium Insurance Services
      </p>
    </Shell>
  );
}
