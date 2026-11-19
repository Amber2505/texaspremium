// app/[locale]/admin/_components/DocumentPicker.tsx
// "What's missing?" tiles + their details. Used on the Payment Links page.
"use client";

import {
  BadgeCheck,
  Car,
  Check,
  GraduationCap,
  Home,
  IdCard,
  MapPin,
  Medal,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export type TileKey =
  | "vehicle"
  | "license"
  | "pop"
  | "poh"
  | "membership"
  | "goodStudent"
  | "military"
  | "garaging"
  | "other";

const TILES: {
  key: TileKey;
  label: string;
  sub: string;
  icon: React.ElementType;
}[] = [
  {
    key: "vehicle",
    label: "Vehicle photos",
    sub: "4 sides + mileage + VIN",
    icon: Car,
  },
  {
    key: "license",
    label: "Driver's license / ID",
    sub: "One per driver",
    icon: IdCard,
  },
  {
    key: "pop",
    label: "Proof of prior (POP)",
    sub: "Prior insurance",
    icon: ShieldCheck,
  },
  {
    key: "poh",
    label: "Proof of homeownership",
    sub: "Mortgage, deed, tax bill",
    icon: Home,
  },
  {
    key: "membership",
    label: "Membership proof",
    sub: "Sam's Club / Costco",
    icon: BadgeCheck,
  },
  {
    key: "goodStudent",
    label: "Good student",
    sub: "Report card",
    icon: GraduationCap,
  },
  {
    key: "military",
    label: "Military",
    sub: "ID or proof of service",
    icon: Medal,
  },
  {
    key: "garaging",
    label: "Garaging proof",
    sub: "Proof of address",
    icon: MapPin,
  },
  { key: "other", label: "Something else", sub: "Describe it", icon: Plus },
];

const POP_PRESETS = [6, 12, 18, 24];

export interface DocPickerValue {
  selected: TileKey[];
  vehicles: string[];
  drivers: number;
  popMonths: number | "custom" | null;
  popCustom: string;
  students: string[];
  others: string[];
}

export const emptyDocPicker = (): DocPickerValue => ({
  selected: [],
  vehicles: [""],
  drivers: 1,
  popMonths: null,
  popCustom: "",
  students: [""],
  others: [""],
});

const popValue = (v: DocPickerValue) =>
  v.popMonths === "custom" ? parseInt(v.popCustom, 10) : v.popMonths;

/** First thing still missing, or [] when the selection is complete. */
export function docPickerProblems(v: DocPickerValue): string[] {
  const has = (k: TileKey) => v.selected.includes(k);
  const p: string[] = [];
  if (!v.selected.length) p.push("Pick at least one missing document");
  if (has("vehicle") && !v.vehicles.some((x) => x.trim()))
    p.push("Enter at least one vehicle");
  const m = popValue(v);
  if (has("pop") && !(m && m >= 1 && m <= 60)) p.push("Pick POP months");
  if (has("goodStudent") && !v.students.some((x) => x.trim()))
    p.push("Enter the student's name");
  if (has("other") && !v.others.some((x) => x.trim()))
    p.push("Describe the other document");
  return p;
}

async function translateToEs(text: string) {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, to: "es" }),
    });
    const data = await res.json();
    return (data.translated as string) || text;
  } catch {
    return text;
  }
}

/** Turns the tiles into the specs the server stores (same shape as the Documents page). */
export async function docPickerToSpecs(
  v: DocPickerValue,
  language: "en" | "es",
) {
  const specs: Record<string, unknown>[] = [];
  for (const t of TILES) {
    if (!v.selected.includes(t.key)) continue;
    switch (t.key) {
      case "vehicle":
        specs.push({
          type: "vehicle",
          vehicles: v.vehicles.map((x) => x.trim()).filter(Boolean),
        });
        break;
      case "license":
        specs.push({ type: "license", drivers: v.drivers });
        break;
      case "pop":
        specs.push({ type: "pop", months: popValue(v) });
        break;
      case "goodStudent":
        specs.push({
          type: "goodStudent",
          students: v.students.map((x) => x.trim()).filter(Boolean),
        });
        break;
      case "other": {
        const labels = await Promise.all(
          v.others
            .map((x) => x.trim())
            .filter(Boolean)
            .map(async (en) => ({
              en,
              es: language === "es" ? await translateToEs(en) : en,
            })),
        );
        specs.push({ type: "other", labels });
        break;
      }
      default:
        specs.push({ type: t.key });
    }
  }
  return specs;
}

const inputCls =
  "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white";

function ListEditor({
  values,
  setValues,
  placeholder,
  addLabel,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={v}
            onChange={(e) =>
              setValues(values.map((x, j) => (j === i ? e.target.value : x)))
            }
            placeholder={placeholder}
            className={inputCls}
          />
          {values.length > 1 && (
            <button
              type="button"
              onClick={() => setValues(values.filter((_, j) => j !== i))}
              className="px-3 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:border-red-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setValues([...values, ""])}
        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}

export default function DocumentPicker({
  value: v,
  onChange,
  language,
}: {
  value: DocPickerValue;
  onChange: (v: DocPickerValue) => void;
  language: "en" | "es" | null;
}) {
  const has = (k: TileKey) => v.selected.includes(k);
  const set = (patch: Partial<DocPickerValue>) => onChange({ ...v, ...patch });
  const toggle = (k: TileKey) =>
    set({
      selected: has(k) ? v.selected.filter((x) => x !== k) : [...v.selected, k],
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {TILES.map(({ key, label, sub, icon: Icon }) => {
          const on = has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`relative rounded-xl border-2 p-2.5 flex flex-col items-center justify-center text-center gap-1 min-h-[96px] transition ${
                on
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {on && (
                <Check className="w-4 h-4 absolute top-1.5 right-1.5 text-blue-600" />
              )}
              <Icon
                className={`w-6 h-6 ${on ? "text-blue-600" : "text-gray-400"}`}
              />
              <span className="text-xs font-semibold leading-tight">
                {label}
              </span>
              <span className="text-[10px] opacity-70 leading-tight">
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {(has("vehicle") ||
        has("license") ||
        has("pop") ||
        has("goodStudent") ||
        has("other")) && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          {has("vehicle") && (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                Which vehicles?
              </p>
              <ListEditor
                values={v.vehicles}
                setValues={(vehicles) => set({ vehicles })}
                placeholder="e.g. 2015 Nissan Altima"
                addLabel="Add vehicle"
              />
            </div>
          )}
          {has("license") && (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                How many drivers?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set({ drivers: Math.max(1, v.drivers - 1) })}
                  className="w-9 h-9 rounded-lg border border-gray-300 bg-white font-bold text-gray-600"
                >
                  −
                </button>
                <span className="w-10 text-center font-bold text-lg">
                  {v.drivers}
                </span>
                <button
                  type="button"
                  onClick={() => set({ drivers: Math.min(10, v.drivers + 1) })}
                  className="w-9 h-9 rounded-lg border border-gray-300 bg-white font-bold text-gray-600"
                >
                  +
                </button>
              </div>
            </div>
          )}
          {has("pop") && (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                Proof of prior: how many months?
              </p>
              <div className="flex flex-wrap gap-2">
                {POP_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ popMonths: m })}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                      v.popMonths === m
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-600"
                    }`}
                  >
                    {m} mo
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set({ popMonths: "custom" })}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                    v.popMonths === "custom"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-600"
                  }`}
                >
                  Custom
                </button>
                {v.popMonths === "custom" && (
                  <input
                    value={v.popCustom}
                    onChange={(e) =>
                      set({
                        popCustom: e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 2),
                      })
                    }
                    placeholder="Months"
                    inputMode="numeric"
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                )}
              </div>
            </div>
          )}
          {has("goodStudent") && (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                Good student: which driver?
              </p>
              <ListEditor
                values={v.students}
                setValues={(students) => set({ students })}
                placeholder="Student driver's name"
                addLabel="Add another student"
              />
            </div>
          )}
          {has("other") && (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                What else do you need?
              </p>
              <ListEditor
                values={v.others}
                setValues={(others) => set({ others })}
                placeholder="e.g. Bill of sale"
                addLabel="Add another"
              />
              {language === "es" && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Type it in English, it&apos;s translated for the customer.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
