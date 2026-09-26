// lib/business-hours.ts
// Client-safe helpers. The live schedule comes from Google Maps via
// lib/business-hours-server.ts (server) or /api/business-hours (browser).

export const BUSINESS_TZ = "America/Chicago";
export const BUSINESS_TZ_LABEL = "CST";

// day (0 = Sunday … 6 = Saturday) → open intervals in 24h local time.
// [9, 19] = 9 AM - 7 PM, [9.5, 18] = 9:30 AM - 6 PM. Empty array = closed.
export type Schedule = Record<number, [number, number][]>;

// FALLBACK ONLY: used when Google can't be reached and nothing is cached.
// Real hour changes go in your Google Business Profile, not here.
export const DEFAULT_SCHEDULE: Schedule = {
  0: [],
  1: [[9, 19]],
  2: [[9, 19]],
  3: [[9, 19]],
  4: [[9, 19]],
  5: [[9, 19]],
  6: [[9, 19]],
};

function localDayAndTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday"),
  );
  // Some runtimes report midnight as "24"
  const time = (Number(get("hour")) % 24) + Number(get("minute")) / 60;
  return { day, time };
}

export function isWithinBusinessHours(
  schedule: Schedule,
  date: Date = new Date(),
): boolean {
  const { day, time } = localDayAndTime(date);
  return (schedule[day] || []).some(([open, close]) => time >= open && time < close);
}

const DAY_NAMES = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
};

function formatHour(h: number): string {
  const whole = Math.floor(h) % 24;
  const mins = Math.round((h - Math.floor(h)) * 60);
  const suffix = whole < 12 ? "AM" : "PM";
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  return mins ? `${h12}:${String(mins).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

// "Monday-Saturday, 9 AM - 7 PM CST", built from the live schedule so the
// text can never drift from the real hours.
export function businessHoursLabel(
  schedule: Schedule,
  lang: "en" | "es" = "en",
): string {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const same = (a: number, b: number) =>
    JSON.stringify(schedule[a] || []) === JSON.stringify(schedule[b] || []);
  const groups: { from: number; to: number }[] = [];

  for (let i = 0; i < order.length; i++) {
    const d = order[i];
    if (!(schedule[d] || []).length) continue;
    const last = groups[groups.length - 1];
    if (last && order[order.indexOf(last.to) + 1] === d && same(last.to, d)) {
      last.to = d;
    } else {
      groups.push({ from: d, to: d });
    }
  }

  const names = DAY_NAMES[lang];
  return groups
    .map(({ from, to }) => {
      const days = from === to ? names[from] : `${names[from]}-${names[to]}`;
      const hours = schedule[from]
        .map(([o, c]) => `${formatHour(o)} - ${formatHour(c)}`)
        .join(", ");
      return `${days}, ${hours} ${BUSINESS_TZ_LABEL}`;
    })
    .join("; ");
}