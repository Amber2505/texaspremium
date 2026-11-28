// app/[locale]/admin/due-reminders/CloudHelp.tsx
// The cloud browser, live on the page. Watch it work; press Take control and then
// just use the screen: click, scroll and type on it like your own browser. Press
// "Give back to AI" to let it carry on from there, or Done on the billing page.
// Your steps are remembered for that carrier, so next time it does it alone.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  CloudOff,
  Globe,
  Hand,
  Keyboard,
  Loader2,
  Monitor,
  MoreHorizontal,
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
  select?: { x: number; y: number; label: string; options: string[] } | null;
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

// Keys passed straight to the cloud browser (everything else printable is typed)
const SPECIAL = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export default function CloudHelp() {
  const [reqs, setReqs] = useState<HelpReq[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [handing, setHanding] = useState<"" | "take" | "stop">("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [goUrl, setGoUrl] = useState("");
  const [typing, setTyping] = useState(""); // keys typed but not sent yet
  const [focused, setFocused] = useState(false);
  const [clickMark, setClickMark] = useState<{ x: number; y: number } | null>(
    null,
  );

  const imgRef = useRef<HTMLImageElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // keeps actions in order
  const typeBuf = useRef("");
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheel = useRef({ dy: 0, x: 0, y: 0 });
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const req = reqs[0];
  const active = !!req || !!live?.busy;

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/due-reminders?live=1", {
        cache: "no-store",
      }).then((r) => r.json());
      setReqs(d.help || []);
      setLive(d.live || null);
    } catch {}
  }, []);

  // Fast refresh while it's working or you're in control, slow when idle
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await load();
      if (!stop) t = setTimeout(loop, active ? 700 : 3000);
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load, active]);

  // Clear "Handing over…" once the browser reacts (help opens or the task ends)
  useEffect(() => {
    if (handing && (reqs.length || !live?.busy)) setHanding("");
  }, [handing, reqs.length, live?.busy]);

  // You're in control: put the keyboard on the screen right away
  useEffect(() => {
    if (req) screenRef.current?.focus();
  }, [req?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setTimeout(load, 400);
    } catch (e) {
      setHanding("");
      setError(e instanceof Error ? e.message : "Couldn't send");
    }
  };

  // One action to the cloud browser. Sent one after another so order is kept.
  const act = useCallback(
    (action: Record<string, unknown>) => {
      if (!req) return;
      const id = req.id;
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch("/api/due-reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "help", id, act: action }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || data.error || "Couldn't send");
          }
          setError("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't send");
        }
      });
      setTimeout(load, 500);
    },
    [req, load],
  );

  const flushTyping = useCallback(() => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
    typeTimer.current = null;
    if (typeBuf.current) {
      act({ type: "type", text: typeBuf.current });
      typeBuf.current = "";
      setTyping("");
    }
  }, [act]);

  const finish = (type: "resume" | "done" | "down" | "skip") => {
    flushTyping();
    setMenu(false);
    act({ type });
  };

  // Screen pixels -> cloud browser page pixels
  const toPage = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return {
      x: Math.round((clientX - r.left) * (img.naturalWidth / r.width)),
      y: Math.round((clientY - r.top) * (img.naturalHeight / r.height)),
      mx: clientX - r.left,
      my: clientY - r.top,
    };
  };

  const onClick = (e: React.MouseEvent) => {
    screenRef.current?.focus();
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    flushTyping();
    setClickMark({ x: p.mx, y: p.my });
    setTimeout(() => setClickMark(null), 900);
    act({ type: "click", x: p.x, y: p.y });
  };

  // Mouse wheel scrolls the cloud browser (not this page). Native listener so it
  // can stop the page from scrolling; bursts are merged into one scroll.
  useEffect(() => {
    const el = screenRef.current;
    if (!el || !req) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toPage(e.clientX, e.clientY);
      if (!p) return;
      wheel.current = { dy: wheel.current.dy + e.deltaY, x: p.x, y: p.y };
      if (!wheelTimer.current)
        wheelTimer.current = setTimeout(() => {
          const w = wheel.current;
          wheel.current = { dy: 0, x: 0, y: 0 };
          wheelTimer.current = null;
          if (Math.abs(w.dy) >= 1)
            act({ type: "scroll", dy: Math.round(w.dy), x: w.x, y: w.y });
        }, 180);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [req, act]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      flushTyping();
      act({ type: "back" });
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // Ctrl+V comes through onPaste
    if (SPECIAL.has(e.key)) {
      e.preventDefault();
      if (e.key === "Backspace" && typeBuf.current) {
        typeBuf.current = typeBuf.current.slice(0, -1); // not sent yet: just drop it
        setTyping(typeBuf.current);
        return;
      }
      flushTyping();
      act({ type: "key", key: e.key });
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      typeBuf.current += e.key;
      setTyping(typeBuf.current);
      if (typeTimer.current) clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(flushTyping, 350);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    typeBuf.current += text.slice(0, 200);
    flushTyping();
  };

  // ── Nothing to help with: what the cloud browser is doing ────────────────
  if (!req) {
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
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Monitor className="w-5 h-5 text-slate-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm">
              {live.carrier || "Checking a policy"}
              {live.policy ? ` · ${live.policy}` : ""}
              {live.customer ? ` · ${live.customer}` : ""}
            </p>
            <p className="text-xs text-gray-600 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              {handing === "take"
                ? "Handing control to you…"
                : handing === "stop"
                  ? "Stopping…"
                  : live.note || "Working…"}
            </p>
          </div>
          <button
            onClick={() => control("stop")}
            disabled={!!handing}
            title="Stop this policy"
            className="p-2 rounded-lg bg-white border border-gray-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => control("pause")}
            title="Finish this policy, then stop until you press Resume"
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-600"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
        <div className="relative border border-gray-300 rounded-lg overflow-hidden bg-white group">
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
          <button
            onClick={() => control("take")}
            disabled={!!handing}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-amber-500 text-white font-semibold shadow-lg hover:bg-amber-600 disabled:opacity-60 flex items-center gap-2"
          >
            {handing === "take" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Hand className="w-4 h-4" />
            )}
            Take control
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // ── You're in control: the screen is the browser ─────────────────────────
  const tookControl = req.question.startsWith("You have control");
  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Hand className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm">
            {tookControl ? "You're in control" : "Needs your help"}:{" "}
            {req.carrier || "carrier"} · {req.policy}
            {req.customer ? ` · ${req.customer}` : ""}
            {reqs.length > 1 && (
              <span className="font-normal text-gray-500">
                {" "}
                · {reqs.length - 1} more waiting
              </span>
            )}
          </p>
          {!tookControl && (
            <p className="text-xs text-gray-700">{req.question}</p>
          )}
        </div>
        <button
          onClick={() => finish("resume")}
          className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <Bot className="w-4 h-4" /> Give back to AI
        </button>
        <button
          onClick={() => finish("done")}
          title="This page shows the policy's amount due"
          className="px-3 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
        >
          <Check className="w-4 h-4" /> Done
        </button>
        <div className="relative">
          <button
            onClick={() => setMenu(!menu)}
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-600"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 text-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const u = goUrl.trim();
                  if (!u) return;
                  flushTyping();
                  act({
                    type: "goto",
                    url: /^https?:\/\//.test(u) ? u : `https://${u}`,
                  });
                  setGoUrl("");
                  setMenu(false);
                }}
                className="flex gap-1 mb-1"
              >
                <input
                  value={goUrl}
                  onChange={(e) => setGoUrl(e.target.value)}
                  placeholder="Go to a website…"
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                />
                <button className="px-2 rounded-lg bg-gray-100 text-gray-700">
                  <Globe className="w-4 h-4" />
                </button>
              </form>
              <button
                onClick={() => finish("down")}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <CloudOff className="w-4 h-4" /> Site is down (try later)
              </button>
              <button
                onClick={() => finish("skip")}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <SkipForward className="w-4 h-4" /> Skip this policy
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={screenRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          flushTyping();
        }}
        className={`relative rounded-lg overflow-hidden bg-white outline-none border-2 ${
          focused ? "border-amber-500" : "border-gray-300"
        }`}
      >
        {req.screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${req.screenshot}`}
            alt="Cloud browser"
            onClick={onClick}
            draggable={false}
            className="w-full cursor-pointer select-none"
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Waiting for the screen…
          </div>
        )}
        {clickMark && (
          <span
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-red-500 bg-red-500/20 pointer-events-none animate-ping"
            style={{ left: clickMark.x, top: clickMark.y }}
          />
        )}
        <span className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-[11px] flex items-center gap-1 pointer-events-none">
          <Keyboard className="w-3 h-3" />
          {focused
            ? "Click, scroll and type on the screen"
            : "Click the screen to use it"}
        </span>
        {(typing || req.pending > 0) && (
          <span className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-xs flex items-center gap-1 pointer-events-none max-w-[60%] truncate">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            {typing ? `Typing “${typing.slice(-30)}”` : "Working…"}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-1 truncate">
        {req.title ? `${req.title} · ` : ""}
        {req.url} · Passwords you type are never saved · Alt+← goes back
      </p>

      {req.select && (
        <div className="mt-3 bg-white border-2 border-amber-400 rounded-lg p-3">
          <p className="text-sm font-semibold text-gray-900 mb-2">
            Choose from the dropdown
            {req.select.label ? `: ${req.select.label}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {req.select.options.map((o) => (
              <button
                key={o}
                onClick={() =>
                  act({
                    type: "select",
                    x: req.select!.x,
                    y: req.select!.y,
                    value: o,
                  })
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-amber-50 hover:border-amber-400"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
