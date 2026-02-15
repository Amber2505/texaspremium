/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import Image from "next/image";
// Assuming you have a utility to get dictionaries, or you can import them directly if small
import en from "@/messages/en.json";
import es from "@/messages/es.json";

export default function PaymentProxyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const lang = (params.lang as string) || (params.locale as string) || "en";
  const t = lang === "es" ? es.paymentProxy : en.paymentProxy;

  const [status, setStatus] = useState<
    "loading" | "disabled" | "redirecting" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [nextStep, setNextStep] = useState("");

  const linkId = params.linkId as string;

  const transactionId =
    searchParams.get("transactionId") ||
    searchParams.get("orderId") ||
    searchParams.get("reference_id") ||
    searchParams.get("checkoutId");

  useEffect(() => {
    const handleRouting = async () => {
      try {
        if (transactionId) {
          await fetch("/api/update-progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkId, step: "payment" }),
          });

          await fetch("/api/update-payment-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkId,
              squareTransactionId: transactionId,
            }),
          });
        }

        const response = await fetch(`/api/check-progress?linkId=${linkId}`);
        const data = await response.json();

        if (!data.success) {
          setStatus("error");
          setErrorMessage("");
          return;
        }

        if (data.disabled) {
          setStatus("disabled");
          return;
        }

        const { nextStep: step, redirectTo } = data;
        setNextStep(step);
        setStatus("redirecting");

        setTimeout(() => {
          if (step === "payment") {
            window.location.href = redirectTo;
          } else {
            router.push(redirectTo);
          }
        }, 1000);
      } catch (error) {
        setStatus("error");
        setErrorMessage("Failed to process request");
      }
    };

    if (linkId) handleRouting();
  }, [linkId, transactionId, router, t.invalidDesc]);

  // Loading State
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Image
          src="/logo.png"
          alt="Texas Premium Insurance Services"
          width={160}
          height={64}
          className="mb-8"
        />
        <div className="relative w-10 h-10 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          <div
            className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#1E3A5F", borderTopColor: "transparent" }}
          ></div>
        </div>
        <p className="text-gray-500 text-sm font-medium">{t.loading}</p>
      </div>
    );
  }

  // Redirecting State
  if (status === "redirecting") {
    const message =
      t.steps[nextStep as keyof typeof t.steps] || t.steps.default;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Image
          src="/logo.png"
          alt="Texas Premium Insurance Services"
          width={160}
          height={64}
          className="mb-8"
        />
        <div className="relative w-10 h-10 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          <div
            className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#1E3A5F", borderTopColor: "transparent" }}
          ></div>
        </div>
        <p className="text-gray-700 text-sm font-semibold">{message}</p>
        {nextStep && nextStep !== "payment" && (
          <p className="text-gray-400 text-xs mt-2">{t.pickingUp}</p>
        )}
      </div>
    );
  }

  // Disabled State
  if (status === "disabled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t.disabledTitle}
          </h1>
          <p className="text-gray-600 mb-6">{t.disabledDesc}</p>
          <p className="text-sm text-gray-500">{t.contactInfo}</p>
          <div className="mt-6">
            <a
              href={`/${lang}#contact`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              {t.contactBtn}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t.invalidTitle}
          </h1>
          <p className="text-gray-600 mb-6">{errorMessage || t.invalidDesc}</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              {t.tryAgain}
            </button>
            <a
              href={`/${lang}#contact`}
              className="block w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              {t.contactBtn}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
