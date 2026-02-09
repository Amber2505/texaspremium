"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import Image from "next/image";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default function PaymentProcessingPage({ params }: PageProps) {
  // Use the 'use' hook to unwrap the params promise (Required for Next.js 15+)
  const resolvedParams = use(params);
  const locale = resolvedParams.locale;

  const searchParams = useSearchParams();
  const router = useRouter();
  const isSpanish = locale === "es";

  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing"
  );
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkPayment = async () => {
      // ✅ Check ALL possible Square redirect parameters
      const referenceId =
        searchParams.get("reference_id") ||
        searchParams.get("checkoutId") ||
        searchParams.get("transactionId") ||
        searchParams.get("orderId") ||
        searchParams.get("paymentId");

      const method = searchParams.get("method") || "card";
      const phone = searchParams.get("phone") || "";

      // Debug: Log all search params to see what Square is actually sending
      console.log("🔍 All URL parameters:", Object.fromEntries(searchParams));
      console.log("🔍 Extracted referenceId:", referenceId);

      if (!referenceId) {
        setStatus("error");
        setErrorMessage(
          isSpanish
            ? "ID de pago no encontrado en la URL. Parámetros: " +
                Array.from(searchParams.keys()).join(", ")
            : "Payment ID not found in URL. Parameters: " +
                Array.from(searchParams.keys()).join(", ")
        );
        return;
      }

      try {
        console.log("📡 Fetching payment data for ID:", referenceId);

        // Fetch payment data from MongoDB
        const response = await fetch(`/api/get-payment-data?id=${referenceId}`);
        const data = await response.json();

        console.log("📦 Payment data response:", data);

        if (data.success && data.payment) {
          setStatus("success");

          // Wait a moment to show success message
          setTimeout(() => {
            // Redirect to consent page with all data from webhook
            const consentUrl =
              `/${locale}/sign-consent?` +
              `amount=${data.payment.amount}&` +
              `card=${data.payment.cardLast4}&` +
              `email=${encodeURIComponent(data.payment.customerEmail)}&` +
              `method=${method}&` +
              `phone=${phone || data.payment.customerPhone}&` +
              `redirect=payment`;

            console.log("✅ Redirecting to consent:", consentUrl);
            router.push(consentUrl);
          }, 1000);
        } else {
          // Payment not found yet - webhook may be delayed
          console.log(`⏳ Payment not found, retry ${retryCount + 1}/10`);

          if (retryCount < 10) {
            // Retry after 2 seconds (max 10 retries = 20 seconds)
            setTimeout(() => {
              setRetryCount((prev) => prev + 1);
            }, 2000);
          } else {
            console.error("❌ Payment not found after 10 retries");
            setStatus("error");
            setErrorMessage(
              isSpanish
                ? "No se pudo encontrar la información del pago. Por favor contacte soporte."
                : "Could not find payment information. Please contact support."
            );
          }
        }
      } catch (error) {
        console.error("❌ Error fetching payment:", error);
        setStatus("error");
        setErrorMessage(
          isSpanish
            ? "Error al procesar el pago. Por favor intente de nuevo."
            : "Error processing payment. Please try again."
        );
      }
    };

    checkPayment();
  }, [searchParams, router, locale, isSpanish, retryCount]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Logo */}
          <Image
            src="/logo.png"
            alt="Texas Premium Insurance Services"
            width={150}
            height={60}
            className="mx-auto mb-6"
          />

          {/* Processing State */}
          {status === "processing" && (
            <>
              <div className="mb-6">
                <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {isSpanish
                  ? "Procesando su pago..."
                  : "Processing your payment..."}
              </h2>
              <p className="text-gray-600 mb-4">
                {isSpanish
                  ? "Por favor espere mientras verificamos su pago"
                  : "Please wait while we verify your payment"}
              </p>
              {retryCount > 0 && (
                <p className="text-sm text-gray-500">
                  {isSpanish
                    ? `Reintento ${retryCount}/10...`
                    : `Retry ${retryCount}/10...`}
                </p>
              )}
            </>
          )}

          {/* Success State */}
          {status === "success" && (
            <>
              <div className="mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {isSpanish ? "¡Pago Confirmado!" : "Payment Confirmed!"}
              </h2>
              <p className="text-gray-600 mb-4">
                {isSpanish
                  ? "Redirigiendo a la página de autorización..."
                  : "Redirecting to authorization page..."}
              </p>
              <div className="animate-spin w-6 h-6 border-3 border-green-200 border-t-green-600 rounded-full mx-auto"></div>
            </>
          )}

          {/* Error State */}
          {status === "error" && (
            <>
              <div className="mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-10 h-10 text-red-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {isSpanish ? "Error al Procesar" : "Processing Error"}
              </h2>
              <p className="text-gray-600 mb-6">{errorMessage}</p>
              <div className="space-y-3">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  {isSpanish ? "Intentar de Nuevo" : "Try Again"}
                </button>
                <a
                  href={`/${locale}/contact`}
                  className="block w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  {isSpanish ? "Contactar Soporte" : "Contact Support"}
                </a>
              </div>
            </>
          )}
        </div>

        {/* Info Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            {isSpanish
              ? "Su pago fue procesado de forma segura por Square"
              : "Your payment was securely processed by Square"}
          </p>
        </div>
      </div>
    </div>
  );
}
