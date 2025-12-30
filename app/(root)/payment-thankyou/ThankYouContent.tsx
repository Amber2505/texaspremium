"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { motion, easeOut } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ThankYouContent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasNotified = useRef(false); // Prevents duplicate emails on refresh/re-render
  const searchParams = useSearchParams();

  useEffect(() => {
    // 1. Trigger confetti
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { y: 0.6 },
      colors: ["#DC2626", "#2563EB", "#059669"],
      disableForReducedMotion: true,
    });

    // 2. Handle video
    const video = videoRef.current;
    if (video) {
      const handleEnded = () => {
        video.pause();
      };
      video.play().catch((error) => console.error("Video play failed:", error));
      video.onended = handleEnded;
    }

    // 3. Send payment notification to your API
    const sendNotification = async () => {
      // Get the transaction ID from Square's redirect URL
      // Square usually sends 'transactionId' or 'checkoutId'
      const transactionId =
        searchParams.get("transactionId") || searchParams.get("checkoutId");

      // Guard: Don't send if we already sent it in this session, or if no ID exists
      if (hasNotified.current || !transactionId) {
        return;
      }

      try {
        hasNotified.current = true; // Mark as sent immediately

        await fetch("/api/notify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: transactionId,
          }),
        });
        console.log("Notification trigger sent successfully");
      } catch (error) {
        console.error("Failed to send notification:", error);
        // Reset so it can try again if it failed
        hasNotified.current = false;
      }
    };

    sendNotification();
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center p-6">
      <motion.div
        className="max-w-3xl text-center bg-white rounded-xl p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: easeOut }}
      >
        <motion.video
          ref={videoRef}
          src="/ccprocessed.mp4"
          muted
          autoPlay
          playsInline
          className="mx-auto mb-6 h-48 rounded-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: easeOut }}
        />

        <motion.h1
          className="text-4xl font-bold text-red-800 mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: easeOut }}
        >
          Thank You!
        </motion.h1>

        <motion.p
          className="text-lg text-gray-700 mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: easeOut }}
        >
          Your payment to Texas Premium Insurance Services is complete.
          We&apos;re grateful for your trust in us!
        </motion.p>

        <motion.p
          className="text-lg text-gray-700 mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8, ease: easeOut }}
        >
          Your coverage is being processed, and we&apos;re here to support you
          every step of the way.
        </motion.p>

        <motion.h2
          className="text-2xl font-semibold text-gray-900 mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1, ease: easeOut }}
        >
          Looking for more coverage? Explore our insurance options:
        </motion.h2>

        <Link
          href="/"
          className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56] transition-colors"
        >
          GET QUOTE
        </Link>
      </motion.div>
    </div>
  );
}
