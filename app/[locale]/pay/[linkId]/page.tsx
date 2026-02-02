// app/[locale]/pay/[linkId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PaymentLinkValidator() {
  const params = useParams();
  const t = useTranslations("paymentLinkValidator");
  const [status, setStatus] = useState<"checking" | "disabled" | "error">(
    "checking"
  );
  const linkId = params.linkId as string;

  useEffect(() => {
    const validateLink = async () => {
      try {
        const response = await fetch(`/api/validate-payment-link/${linkId}`);
        const data = await response.json();

        if (data.disabled) {
          setStatus("disabled");
        } else if (data.squareLink) {
          // Link is valid - redirect to Square
          window.location.href = data.squareLink;
        } else {
          setStatus("error");
        }
      } catch (error) {
        console.error("Error validating link:", error);
        setStatus("error");
      }
    };

    if (linkId) {
      validateLink();
    }
  }, [linkId]);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {t("checking.title")}
          </h2>
          <p className="text-gray-600">{t("checking.message")}</p>
        </div>
      </div>
    );
  }

  if (status === "disabled") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {t("disabled.title")}
          </h1>
          <p className="text-gray-600 mb-6">{t("disabled.message")}</p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              <strong>{t("disabled.assistanceTitle")}</strong>{" "}
              {t("disabled.assistanceMessage")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 flex items-center justify-center p-6">
      <div className="max-w-md mx-auto text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-12 h-12 text-red-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {t("error.title")}
        </h1>
        <p className="text-gray-600 mb-6">{t("error.message")}</p>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            <strong>{t("error.assistanceTitle")}</strong>{" "}
            {t("error.assistanceMessage")}
          </p>
        </div>
      </div>
    </div>
  );
}
