"use client";

import { useEffect, useState, useCallback } from "react";
import io from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";
const COUNTS_KEY = "admin_notify_counts";
const SEEN_KEY = "admin_notify_seen";
const SEEN_CAP = 300;

export type NotifySection =
  | "live-chat"
  | "messages"
  | "autopay"
  | "payment-links";

// Admin route → notification section
export const SECTION_BY_PATH: Record<string, NotifySection> = {
  "/admin/live-chat": "live-chat",
  "/admin/message-stored": "messages",
  "/admin/autopay": "autopay",
  "/admin/create-payment-link": "payment-links",
};

type Counts = Partial<Record<NotifySection, number>>;

interface AdminNotification {
  section: NotifySection;
  title: string;
  body: string;
  eventId: string;
  timestamp: string;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Notification store write failed:", e);
  }
};

// Module-level singleton — every admin page mounts the sidebar, and we only
// ever want ONE socket per tab no matter how many components subscribe.
let sharedSocket: ReturnType<typeof io> | null = null;
const listeners = new Set<(c: Counts) => void>();

const broadcast = (counts: Counts) => {
  listeners.forEach((fn) => fn(counts));
};

const applyEvent = (n: AdminNotification) => {
  const seen = read<string[]>(SEEN_KEY, []);
  if (seen.includes(n.eventId)) return; // dedupe across tabs + retried syncs

  const nextSeen = [n.eventId, ...seen].slice(0, SEEN_CAP);
  write(SEEN_KEY, nextSeen);

  const counts = read<Counts>(COUNTS_KEY, {});
  counts[n.section] = (counts[n.section] || 0) + 1;
  write(COUNTS_KEY, counts);
  broadcast(counts);
};

const ensureSocket = () => {
  if (sharedSocket || !SOCKET_URL) return;

  sharedSocket = io(SOCKET_URL, {
    reconnection: true,
    transports: ["websocket", "polling"],
  });

  sharedSocket.on("connect", () => {
    sharedSocket?.emit("join-admin-notifications");
  });

  sharedSocket.on("admin-notification", (n: AdminNotification) => {
    applyEvent(n);
  });
};

export function useAdminNotifications(clearSection?: NotifySection) {
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    setCounts(read<Counts>(COUNTS_KEY, {}));
    ensureSocket();

    const onChange = (c: Counts) => setCounts({ ...c });
    listeners.add(onChange);

    // Another tab cleared or incremented — stay in sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === COUNTS_KEY) setCounts(read<Counts>(COUNTS_KEY, {}));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const clear = useCallback((section: NotifySection) => {
    const next = read<Counts>(COUNTS_KEY, {});
    if (!next[section]) return;
    delete next[section];
    write(COUNTS_KEY, next);
    broadcast(next);
  }, []);

  // Landing on a section's page means you've seen it
  useEffect(() => {
    if (clearSection) clear(clearSection);
  }, [clearSection, clear]);

  return { counts, clear };
}