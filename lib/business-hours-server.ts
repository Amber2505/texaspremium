// lib/business-hours-server.ts
// SERVER ONLY (imports MongoDB — never import this from a client component).
// Pulls office hours from Google Maps so they're managed in one place:
// your Google Business Profile. Cached in Mongo; Google is called at most
// once every 6 hours regardless of traffic.
import clientPromise from "@/lib/mongodb";
import { DEFAULT_SCHEDULE, type Schedule } from "@/lib/business-hours";

const REFRESH_MS = 6 * 60 * 60 * 1000;
const MEMORY_TTL_MS = 10 * 60 * 1000;

export type BusinessHoursInfo = {
  schedule: Schedule;
  source: "google" | "cache" | "default";
  fetchedAt: string | null;
};

type GPoint = { day: number; hour?: number; minute?: number };
type GPeriod = { open?: GPoint; close?: GPoint };

let memory: { info: BusinessHoursInfo; expires: number } | null = null;

function periodsToSchedule(periods: GPeriod[]): Schedule | null {
  const s: Schedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  for (const p of periods) {
    if (!p.open) continue;
    const openDay = p.open.day;
    const openT = (p.open.hour ?? 0) + (p.open.minute ?? 0) / 60;

    // A period with no close is Google's way of saying "open 24/7"
    if (!p.close) {
      for (let d = 0; d < 7; d++) s[d] = [[0, 24]];
      return s;
    }

    const closeDay = p.close.day;
    const closeT = (p.close.hour ?? 0) + (p.close.minute ?? 0) / 60;

    if (closeDay === openDay && closeT > openT) {
      s[openDay].push([openT, closeT]);
    } else {
      // Crosses midnight: split across the two days
      s[openDay].push([openT, 24]);
      if (closeT > 0) s[closeDay].push([0, closeT]);
    }
  }

  for (let d = 0; d < 7; d++) s[d].sort((a, b) => a[0] - b[0]);

  // Zero open hours all week is almost certainly bad data. Trusting it
  // would flip the site to "closed" permanently.
  return Object.values(s).some((iv) => iv.length > 0) ? s : null;
}

async function fetchFromGoogle(): Promise<Schedule | null> {
  const placeId = process.env.GOOGLE_PLACE_ID;
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!placeId || !key) {
    console.warn("business hours: GOOGLE_PLACE_ID or API key not set");
    return null;
  }

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "currentOpeningHours,regularOpeningHours",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      // 403 here usually means the key is restricted to your website
      console.error(
        "Google Places hours error:",
        res.status,
        (await res.text()).slice(0, 300),
      );
      return null;
    }
    const data = await res.json();
    // currentOpeningHours = this week, INCLUDING holiday/special hours.
    // regularOpeningHours = the normal weekly schedule, as a backup.
    return (
      periodsToSchedule(data.currentOpeningHours?.periods || []) ??
      periodsToSchedule(data.regularOpeningHours?.periods || [])
    );
  } catch (err) {
    console.error("Google Places hours fetch failed:", err);
    return null;
  }
}

export async function getBusinessHoursInfo(): Promise<BusinessHoursInfo> {
  if (memory && Date.now() < memory.expires) return memory.info;

  let info: BusinessHoursInfo = {
    schedule: DEFAULT_SCHEDULE,
    source: "default",
    fetchedAt: null,
  };

  try {
    const client = await clientPromise;
    const coll = client
      .db("db")
      .collection<{ _id: string; schedule: Schedule; fetchedAt: Date }>(
        "app_settings",
      );

    const cached = await coll.findOne({ _id: "business_hours" });
    const cachedAge = cached
      ? Date.now() - new Date(cached.fetchedAt).getTime()
      : Infinity;

    if (cached && cachedAge < REFRESH_MS) {
      info = {
        schedule: cached.schedule,
        source: "cache",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
      };
    } else {
      const fromGoogle = await fetchFromGoogle();
      if (fromGoogle) {
        const now = new Date();
        await coll.updateOne(
          { _id: "business_hours" },
          { $set: { schedule: fromGoogle, fetchedAt: now } },
          { upsert: true },
        );
        info = {
          schedule: fromGoogle,
          source: "google",
          fetchedAt: now.toISOString(),
        };
      } else if (cached) {
        // Google failed: a stale copy beats the hardcoded fallback
        info = {
          schedule: cached.schedule,
          source: "cache",
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
        };
      }
    }
  } catch (err) {
    console.error("business hours load failed:", err);
  }

  memory = { info, expires: Date.now() + MEMORY_TTL_MS };
  return info;
}