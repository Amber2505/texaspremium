"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import { motion, easeOut } from "framer-motion";
import Link from "next/link";

export default function ThankYouContent() {
  const t = useTranslations("thankYou");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 1. Trigger confetti
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { y: 0.6 },
      colors: ["#A0103D", "#102a56", "#059669"],
      disableForReducedMotion: true,
    });

    // 2. Handle video
    const video = videoRef.current;
    if (video) {
      video.play().catch((error) => console.error("Video play failed:", error));
    }
  }, []);

  return (
    <div className="flex items-center justify-center p-6 min-h-[70vh]">
      <motion.div
        className="max-w-2xl text-center bg-white rounded-2xl shadow-xl border border-gray-100 p-10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: easeOut }}
      >
        <motion.video
          ref={videoRef}
          src="/ccprocessed.mp4"
          muted
          autoPlay
          playsInline
          className="mx-auto mb-8 h-40 w-auto rounded-lg shadow-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-4xl font-extrabold text-[#A0103D] mb-4">
            {t("title")}
          </h1>
          <p className="text-xl text-gray-600 mb-6 font-medium">
            {t("subtitle")}
          </p>
          <div className="w-16 h-1 bg-[#A0103D] mx-auto mb-6 rounded-full" />
          <p className="text-gray-500 mb-10 leading-relaxed">{t("message")}</p>
        </motion.div>
        <Link
          href="/"
          className="inline-block bg-[#A0103D] text-white font-bold py-4 px-10 rounded-full hover:bg-[#102a56] transform hover:scale-105 transition-all shadow-lg"
        >
          {t("returnButton")}
        </Link>
      </motion.div>
    </div>
  );
}
