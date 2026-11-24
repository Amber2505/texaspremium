// app/[locale]/admin/due-reminders/CloudHelp.tsx
// The cloud browser, live on the page. While it checks a policy you watch it work
// and can press Take control or Stop task at any time. When it's stuck (sign-in,
// can't find the policy, unknown site) it asks you to take over. You click on the
// screen and type to drive it, then press Done on the billing page. Your steps are
// remembered for that carrier, so next time it does it alone (no AI).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CornerDownLeft,
  Hand,
  Loader2,
  Monitor,
  MousePointerClick,
  Pause,
  Play,
  SkipForward,
  Square,
} from "lucide-react";

interface HelpReq {
  id: string;
  carrier: string;
  policy: string;
  customer?: string;
  question: string;
  url: string;
  title?: string;
  screenshot: string;
  pending: number;
  updated_at: string;
}

interface LiveState {
  online: boolean;
  busy: boolean;
  taskId: string;
  carrier: string;
  policy: string;
  customer?: string | null;
  note: string;
  paused: boolean;
  control?: string | null;
  url: string;
  screenshot: string;
}

export default function CloudHelp() {
  const [reqs, setReqs] = useState<HelpReq[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [handing, setHanding] = useState<"" | "take" | "stop">("");
  const [text, setText] = useState("");
  const [goUrl, setGoUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [clickMark, setClickMark] = useState<{ x: number; y: number } | null>(
    null,
  );
  const imgRef = useRef<HTMLImageElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/due-reminders?live=1", {
        cache: "no-store",
      }).then((r) => r.json());
      setReqs(d.help || []);
      setLive(d.live || null);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  // Clear "Handing over…" once the browser reacts (help opens or the task ends)
  useEffect(() => {
    if (handing && (reqs.length || !live?.busy)) setHanding("");
  }, [handing, reqs.length, live?.busy]);

  const control = async (c: "take" | "stop" | "pause" | "resume") => {
    setError("");
    if (c === "take" || c === "stop") setHanding(c);
    try {
      const res = await fetch("/api/due-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "live", control: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't send");
      setTimeout(load, 800);
    } catch (e) {
      setHanding("");
      setError(e instanceof Error ? e.message : "Couldn't send");
    }
  };

  const req = reqs[0];

  const act = async (action: Record<string, unknown>) => {
    if (!req) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/due-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "help", id: req.id, act: action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.detail || data.error || "Couldn't send");
      setTimeout(load, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  };

  const onImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    // Screenshot pixels = browser page pixels
    const x = Math.round((e.clientX - r.left) * (img.naturalWidth / r.width));
    const y = Math.round((e.clientY - r.top) * (img.naturalHeight / r.height));
    setClickMark({ x: e.clientX - r.left, y: e.clientY - r.top });
    setTimeout(() => setClickMark(null), 1500);
    act({ type: "click", x, y });
  };

  if (!req) {
    // Not stuck: show what the cloud browser is doing right now
    if (!live) return null;
    if (!live.busy) {
      return (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 mb-4 text-sm">
          <Monitor className="w-4 h-4 text-gray-400" />
          <span
            className={`w-2 h-2 rounded-full ${
              !live.online
                ? "bg-red-500"
                : live.paused
                  ? "bg-amber-500"
                  : "bg-green-500"
            }`}
          />
          <span className="text-gray-700">
            Cloud browser{" "}
            {!live.online
              ? "is offline (check the due-worker on Railway)"
              : live.paused
                ? "is paused"
                : "is idle. It checks new policies as they come in."}
          </span>
          <button
            onClick={() => control(live.paused ? "resume" : "pause")}
            className="ml-auto px-3 py-1 rounded-lg border border-gray-300 text-gray-700 flex items-center gap-1"
          >
            {live.paused ? (
              <>
                <Play className="w-3.5 h-3.5" /> Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause
              </>
            )}
          </button>
          {error && <span className="text-red-600">{error}</span>}
        </div>
      );
    }
    return (
      <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-start gap-3 mb-2">
          <Monitor className="w-6 h-6 text-slate-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">
              Cloud browser is checking {live.carrier || "a policy"}
              {live.policy ? ` · policy ${live.policy}` : ""}
              {live.customer ? ` · ${live.customer}` : ""}
            </p>
            <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              {handing === "take"
                ? "Handing control to you…"
                : handing === "stop"
                  ? "Stopping…"
                  : live.note || "Working…"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => control("take")}
              disabled={!!handing}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
            >
              <Hand className="w-4 h-4" /> Take control
            </button>
            <button
              onClick={() => control("stop")}
              disabled={!!handing}
              className="px-3 py-2 text-sm rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
            >
              <Square className="w-4 h-4" /> Stop task
            </button>
            <button
              onClick={() => control("pause")}
              title="Finish this policy, then stop until you press Resume"
              className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300 text-gray-600 flex items-center gap-1"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 truncate mb-1">{live.url}</p>
        <div className="relative border border-gray-300 rounded-lg overflow-hidden bg-white">
          {live.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/jpeg;base64,${live.screenshot}`}
              alt="Cloud browser"
              className="w-full select-none"
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              Connecting to the screen…
            </div>
          )}
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px]">
            Live · press Take control to click
          </span>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  const tookControl = req.question.startsWith("You have control");

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <Hand className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {tookControl
              ? "You're in control"
              : "The cloud browser needs your help"}
            : {req.carrier || "carrier"} · policy {req.policy}
            {req.customer ? ` · ${req.customer}` : ""}
          </p>
          <p className="text-sm text-gray-700 mt-0.5">{req.question}</p>
          <p className="text-xs text-gray-500 mt-1">
            Click on the screen below exactly where you would click. Type with
            the box underneath. Press <b>Done</b> when the page shows the
            policy&apos;s amount due. Your steps are remembered for{" "}
            {req.carrier || "this carrier"}. Passwords you type are never saved.
            {reqs.length > 1 && ` · ${reqs.length - 1} more waiting`}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 truncate mb-1">
        {req.title ? `${req.title} · ` : ""}
        {req.url}
      </p>
      <div className="relative border border-gray-300 rounded-lg overflow-hidden bg-white">
        {req.screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${req.screenshot}`}
            alt="Cloud browser"
            onClick={onImageClick}
            className="w-full cursor-crosshair select-none"
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Waiting for the screen…
          </div>
        )}
        {clickMark && (
          <span
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-red-500 bg-red-500/20 pointer-events-none"
            style={{ left: clickMark.x, top: clickMark.y }}
          />
        )}
        {(sending || req.pending > 0) && (
          <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs">
            <Loader2 className="w-3 h-3 animate-spin" /> Working…
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text) {
              act({ type: "type", text });
              setText("");
            }
          }}
          placeholder="Click a box on the screen first, then type here"
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
        />
        <button
          onClick={() => {
            if (text) act({ type: "type", text });
            setText("");
          }}
          disabled={!text}
          className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-white disabled:opacity-40"
        >
          Type
        </button>
        <button
          onClick={() => act({ type: "key", key: "Enter" })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300 flex items-center gap-1"
        >
          <CornerDownLeft className="w-4 h-4" /> Enter
        </button>
        <button
          onClick={() => act({ type: "key", key: "Backspace" })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300"
        >
          ⌫
        </button>
        <button
          onClick={() => act({ type: "scroll", dy: 500 })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300"
        >
          Scroll ↓
        </button>
        <button
          onClick={() => act({ type: "scroll", dy: -500 })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300"
        >
          Scroll ↑
        </button>
        <button
          onClick={() => act({ type: "back" })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <input
          value={goUrl}
          onChange={(e) => setGoUrl(e.target.value)}
          placeholder="https://… (go to a website)"
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
        />
        <button
          onClick={() => {
            if (/^https?:\/\//.test(goUrl)) act({ type: "goto", url: goUrl });
            setGoUrl("");
          }}
          disabled={!/^https?:\/\//.test(goUrl)}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300 disabled:opacity-40 flex items-center gap-1"
        >
          <MousePointerClick className="w-4 h-4" /> Go to
        </button>
        <button
          onClick={() => act({ type: "done" })}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
        >
          <Check className="w-4 h-4" /> Done: this shows the amount due
        </button>
        <button
          onClick={() => act({ type: "skip" })}
          className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-300 text-gray-600 flex items-center gap-1"
        >
          <SkipForward className="w-4 h-4" /> Stop task (skip)
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
