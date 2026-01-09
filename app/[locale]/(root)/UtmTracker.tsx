"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function UtmTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const campaignName = searchParams.get("utm_campaign");
    if (campaignName) {
      localStorage.setItem("campaignName", campaignName);
    }
  }, [searchParams]);

  return null;
}
