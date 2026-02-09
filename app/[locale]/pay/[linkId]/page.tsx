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
    searchParams.get("transactionId") || searchParams.get("orderId");
  const checkoutId = searchParams.get("checkoutId");

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
        if (transactionId || checkoutId) {
          // Payment completed - redirect to sign-consent
          setStatus("redirecting");

          const paymentAmount = link.amount
            ? (link.amount / 100).toFixed(2)
            : "0.00";
          const cardLast4 = "****"; // Will be filled by sign-consent from Square webhook data

          // Redirect to sign-consent page with payment info
          const consentUrl =
            `/${lang}/sign-consent?` +
            `amount=${paymentAmount}&` +
            `card=${cardLast4}&` +
            `email=${encodeURIComponent(link.customerPhone || "")}&` +
            `method=${link.paymentMethod}&` +
            `transactionId=${transactionId || checkoutId}&` +
            `linkId=${linkId}`;

          router.push(consentUrl);
          return;
        }

        // 4️⃣ First time visiting - redirect to Square payment
        if (link.squareLink) {
          window.location.href = link.squareLink;
        } else {
          setStatus("error");
          setErrorMessage("Payment link is invalid");
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
  }, [linkId, transactionId, checkoutId, lang, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Validating payment link...</p>
        </div>
      </div>
    );
  }

  if (status === "redirecting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">
            Payment successful! Redirecting...
          </p>
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
            Link Disabled
          </h1>
          <p className="text-gray-600 mb-6">
            This payment link has been disabled and is no longer active.
          </p>
          <p className="text-sm text-gray-500">
            Please contact Texas Premium Insurance Services for assistance.
          </p>
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
            Invalid Link
          </h1>
          <p className="text-gray-600 mb-6">
            {errorMessage || "This payment link is invalid or has expired."}
          </p>
          <p className="text-sm text-gray-500">
            Please contact Texas Premium Insurance Services for a new payment
            link.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
