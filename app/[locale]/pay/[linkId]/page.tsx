// app/[lang]/pay/[linkId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function PaymentProxyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<
    "loading" | "disabled" | "redirecting" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [nextStep, setNextStep] = useState("");

  const linkId = params.linkId as string;
  const lang = params.lang as string;

  // Check if returning from Square payment
  const transactionId =
    searchParams.get("transactionId") ||
    searchParams.get("orderId") ||
    searchParams.get("reference_id") ||
    searchParams.get("checkoutId");

  useEffect(() => {
    const handleRouting = async () => {
      try {
        // 1️⃣ If returning from Square, mark payment as complete first
        if (transactionId) {
          console.log("✅ Returned from Square, marking payment complete");

          await fetch("/api/update-progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkId,
              step: "payment",
            }),
          });

          // Also store Square transaction ID
          await fetch("/api/update-payment-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkId,
              squareTransactionId: transactionId,
            }),
          });
        }

        // 2️⃣ Check current progress from MongoDB
        const response = await fetch(`/api/check-progress?linkId=${linkId}`);
        const data = await response.json();

        if (!data.success) {
          setStatus("error");
          setErrorMessage(data.error || "Link not found");
          return;
        }

        // 3️⃣ Check if link is disabled
        if (data.disabled) {
          setStatus("disabled");
          return;
        }

        // 4️⃣ Get next step and redirect
        const { nextStep: step, redirectTo, progress } = data;

        console.log("📊 Current progress:", progress);
        console.log("➡️ Next step:", step);
        console.log("🔗 Redirecting to:", redirectTo);

        setNextStep(step);
        setStatus("redirecting");

        // Wait a moment to show the status
        setTimeout(() => {
          if (step === "payment") {
            // External Square link
            window.location.href = redirectTo;
          } else {
            // Internal route
            router.push(redirectTo);
          }
        }, 1000);
      } catch (error) {
        console.error("Error in routing:", error);
        setStatus("error");
        setErrorMessage("Failed to process request");
      }
    };

    if (linkId) {
      handleRouting();
    }
  }, [linkId, transactionId, router, lang]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Checking your progress...</p>
          <p className="text-sm text-gray-500 mt-2">
            {lang === "es"
              ? "Esto solo tomará un momento"
              : "This will only take a moment"}
          </p>
        </div>
      </div>
    );
  }

  if (status === "redirecting") {
    const stepMessages = {
      payment:
        lang === "es" ? "Redirigiendo al pago..." : "Redirecting to payment...",
      consent:
        lang === "es"
          ? "Redirigiendo al formulario de consentimiento..."
          : "Redirecting to consent form...",
      autopay:
        lang === "es"
          ? "Redirigiendo a configuración de autopago..."
          : "Redirecting to autopay setup...",
      complete:
        lang === "es"
          ? "¡Todo completo! Redirigiendo..."
          : "All complete! Redirecting...",
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="text-center max-w-md mx-auto p-8">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {stepMessages[nextStep as keyof typeof stepMessages] ||
              "Redirecting..."}
          </h2>
          <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full mx-auto mt-4"></div>

          {nextStep && nextStep !== "payment" && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {lang === "es"
                  ? "Retomando donde lo dejaste..."
                  : "Picking up where you left off..."}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "disabled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {lang === "es" ? "Enlace Deshabilitado" : "Link Disabled"}
          </h1>
          <p className="text-gray-600 mb-6">
            {lang === "es"
              ? "Este enlace de pago ha sido deshabilitado y ya no está activo."
              : "This payment link has been disabled and is no longer active."}
          </p>
          <p className="text-sm text-gray-500">
            {lang === "es"
              ? "Por favor contacte a Texas Premium Insurance Services para asistencia."
              : "Please contact Texas Premium Insurance Services for assistance."}
          </p>
          <div className="mt-6">
            <a
              href={`/${lang}/contact`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              {lang === "es" ? "Contactar Soporte" : "Contact Support"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {lang === "es" ? "Enlace Inválido" : "Invalid Link"}
          </h1>
          <p className="text-gray-600 mb-6">
            {errorMessage ||
              (lang === "es"
                ? "Este enlace de pago es inválido o ha expirado."
                : "This payment link is invalid or has expired.")}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              {lang === "es" ? "Intentar de Nuevo" : "Try Again"}
            </button>
            <a
              href={`/${lang}/contact`}
              className="block w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              {lang === "es" ? "Contactar Soporte" : "Contact Support"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
