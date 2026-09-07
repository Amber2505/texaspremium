//app/[locale]/(root)/payment-thankyou/ThankYouContent.tsx
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
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { y: 0.6 },
      colors: ["#A0103D", "#102a56", "#059669"],
      disableForReducedMotion: true,
    });

    const video = videoRef.current;
    if (video) {
      video.play().catch((error) => console.error("Video play failed:", error));
    }
  }, []);

  // Wording has to fit a brand-new policy AND a routine monthly payment —
  // this page can't tell which one it is.
  const steps = [
    { key: "step1", done: true },
    { key: "step2", done: false },
    { key: "step3", done: false },
  ];

  return (
    <div className="flex items-center justify-center p-6 min-h-[70vh]">
      <motion.div
        className="max-w-2xl w-full text-center bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10"
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
          className="mx-auto mb-6 h-32 w-auto rounded-lg shadow-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#A0103D] mb-3">
            {t("title")}
          </h1>
          <p className="text-lg text-gray-600 mb-5 font-medium">
            {t("subtitle")}
          </p>
          <div className="w-16 h-1 bg-[#A0103D] mx-auto mb-6 rounded-full" />
        </motion.div>

        {/* What happens next — turns an empty wait into a known one */}
        <motion.div
          className="text-left bg-gray-50 border border-gray-100 rounded-xl p-5 sm:p-6 mb-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
            {t("next.heading")}
          </p>

          <ol className="space-y-4">
            {steps.map(({ key, done }, i) => (
              <li key={key} className="flex gap-3">
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : "bg-white border-2 border-gray-200 text-gray-400"
                  }`}
                >
                  {done ? (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="min-w-0 -mt-0.5">
                  <p
                    className={`text-sm font-semibold ${
                      done ? "text-gray-800" : "text-gray-700"
                    }`}
                  >
                    {t(`next.${key}.title`)}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed mt-0.5">
                    {t(`next.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </motion.div>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Link
            href="/view_documents"
            className="inline-block bg-[#A0103D] text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#102a56] transition-all shadow-lg"
          >
            {t("next.documentsButton")}
          </Link>
          <Link
            href="/"
            className="inline-block bg-gray-100 text-gray-600 font-semibold py-3.5 px-8 rounded-full hover:bg-gray-200 transition-all"
          >
            {t("returnButton")}
          </Link>
        </motion.div>

        <p className="text-xs text-gray-400 mt-6">{t("next.help")}</p>
      </motion.div>
    </div>
  );
}
