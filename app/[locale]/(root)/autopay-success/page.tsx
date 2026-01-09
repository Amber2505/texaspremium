"use client";

import { motion } from "framer-motion";
import { CheckCircle, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import confetti from "canvas-confetti";

export default function AutopaySuccessPage() {
  const t = useTranslations("AutopaySuccess");

  useEffect(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#A0103D", "#60a5fa", "#059669"],
      disableForReducedMotion: true,
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center py-12 px-4">
      <motion.div
        className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-col md:flex-row">
          {/* Left Column: Confirmation */}
          <div className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-gray-100">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="bg-green-100 rounded-full p-4 mb-6"
            >
              <CheckCircle className="w-12 h-12 text-green-600" />
            </motion.div>

            <h1 className="text-3xl font-extrabold text-gray-900 mb-4 leading-tight">
              {t("title")}
            </h1>
            <p className="text-gray-600 mb-8 font-medium">{t("subtitle")}</p>

            <Link
              href="/"
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 py-3 px-8 bg-[#A0103D] hover:bg-[#800d31] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
            >
              {t("button")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Right Column: Information Section */}
          <div className="flex-1 bg-slate-50/50 p-8 md:p-12 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-6 text-blue-600">
              <ShieldCheck className="w-6 h-6" />
              <h2 className="font-bold text-lg text-gray-800">
                {t("cardTitle")}
              </h2>
            </div>

            <ul className="space-y-6 text-sm md:text-base text-gray-600">
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold">•</span>
                <span>{t("feature1")}</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold">•</span>
                <span>{t("feature2")}</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold">•</span>
                <span>
                  {t.rich("feature3", {
                    bold: (chunks) => (
                      <strong className="text-gray-900">{chunks}</strong>
                    ),
                  })}
                </span>
              </li>
            </ul>

            <div className="mt-10 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {t("help")}{" "}
                <a
                  href="tel:+14697295185"
                  className="text-blue-600 font-bold hover:underline"
                >
                  {t("callUs", { phone: "(469) 729-5185" })}
                </a>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
