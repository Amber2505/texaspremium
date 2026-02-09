// app/[lang]/pay/[linkId]/page.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const [linkData, setLinkData] = useState<any>(null);

  const linkId = params.linkId as string;
  const lang = params.lang as string;

  // ✅ Check if Square payment completed (from Square redirect)
  const transactionId =
    searchParams.get("transactionId") ||
    searchParams.get("orderId") ||
    searchParams.get("reference_id") ||
    searchParams.get("checkoutId");

  useEffect(() => {
    const validateAndRedirect = async () => {
      try {
        // 1️⃣ Fetch link data from MongoDB
        const response = await fetch(`/api/get-payment-link?linkId=${linkId}`);
        const data = await response.json();

        if (!data.success) {
          setStatus("error");
          setErrorMessage(data.error || "Link not found");
          return;
        }

        const link = data.link;
        setLinkData(link);

        // 2️⃣ Check if link is disabled
        if (link.disabled) {
          setStatus("disabled");
          return;
        }

        // 3️⃣ Check if this is a return from Square payment
        if (transactionId) {
          // ✅ Payment completed - redirect to payment-processing page
          // The processing page will fetch payment data from MongoDB and redirect to consent
          setStatus("redirecting");

          const processingUrl =
            `/${lang}/payment-processing?` +
            `reference_id=${transactionId}&` +
            `method=${link.paymentMethod || "card"}&` +
            `phone=${link.customerPhone || ""}`;

          router.push(processingUrl);
          return;
        }

        // 4️⃣ First time visiting - redirect to Square payment
        if (link.squareLink) {
          console.log("Redirecting to Square payment link:", link.squareLink);
          window.location.href = link.squareLink;
        } else {
          setStatus("error");
          setErrorMessage("Payment link is invalid or expired");
        }
      } catch (error) {
        console.error("Error validating link:", error);
        setStatus("error");
        setErrorMessage("Failed to validate payment link");
      }
    };

    if (linkId) {
      validateAndRedirect();
    }
  }, [linkId, transactionId, lang, router, searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Validating payment link...</p>
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {lang === "es" ? "¡Pago Exitoso!" : "Payment Successful!"}
          </h2>
          <p className="text-gray-600 text-lg mb-2">
            {lang === "es"
              ? "Procesando su información..."
              : "Processing your information..."}
          </p>
          <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full mx-auto mt-4"></div>
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
          <p className="text-sm text-gray-500 mb-6">
            {lang === "es"
              ? "Por favor contacte a Texas Premium Insurance Services para un nuevo enlace de pago."
              : "Please contact Texas Premium Insurance Services for a new payment link."}
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
