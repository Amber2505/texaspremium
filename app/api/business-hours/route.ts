// app/api/business-hours/route.ts
// Lets the browser (Samantha) read the same Google-sourced hours.
import { NextResponse } from "next/server";
import { getBusinessHoursInfo } from "@/lib/business-hours-server";
import { businessHoursLabel } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getBusinessHoursInfo();
  return NextResponse.json(
    {
      ...info,
      label: {
        en: businessHoursLabel(info.schedule, "en"),
        es: businessHoursLabel(info.schedule, "es"),
      },
    },
    // Edge-cached so every site visitor doesn't hit the function
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}