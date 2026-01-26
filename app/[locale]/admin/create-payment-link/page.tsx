// app/admin/create-payment-link/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  DollarSign,
  Loader2,
  CreditCard,
  Building2,
  FileText,
  Globe,
  Link2,
  Shield,
} from "lucide-react";

type LinkType = "payment" | "autopay-only";

export default function CreatePaymentLink() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [linkType, setLinkType] = useState<LinkType>("payment");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "bank" | "direct-bill"
  >("card");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkAuth = () => {
      const savedSession = localStorage.getItem("admin_session");
      if (!savedSession) {
        window.location.href = "/admin";
        return;
      }

      try {
        const session = JSON.parse(savedSession);
        const now = Date.now();

        if (now >= session.expiresAt) {
          localStorage.removeItem("admin_session");
          window.location.href = "/admin";
        } else {
          setIsCheckingAuth(false);
        }
      } catch {
        localStorage.removeItem("admin_session");
        window.location.href = "/admin";
      }
    };

    checkAuth();
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setGeneratedLink("");

    try {
      if (linkType === "autopay-only") {
        // Generate autopay setup link directly (no API call needed)
        if (!customerPhone || paymentMethod === "direct-bill") {
          setError(
            "Please select a valid phone number and autopay method (Card or Bank)"
          );
          setLoading(false);
          return;
        }

        const autopayLink = `https://www.texaspremiumins.com/${language}/setup-autopay?${paymentMethod}&phone=${customerPhone}&redirect=autopay`;
        setGeneratedLink(autopayLink);
        setLoading(false);
        return;
      }

      // Create payment link with Square API
      const response = await fetch("/api/create-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount) * 100,
          description,
          customerPhone,
          paymentMethod,
          language,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setGeneratedLink(data.paymentLink);
      } else {
        setError(data.error || "Failed to create payment link");
      }
    } catch (err) {
      console.error("Error creating link:", err);
      setError("Failed to create link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedLink) {
      try {
        await navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const getPaymentMethodLabel = () => {
    switch (paymentMethod) {
      case "card":
        return "card autopay";
      case "bank":
        return "bank autopay";
      case "direct-bill":
        return "direct billing (no autopay)";
      default:
        return "";
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 mt-4">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center">
              <Link2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Link</h1>
              <p className="text-gray-600 text-sm">
                Generate payment or autopay setup links
              </p>
            </div>
          </div>
        </div>

        {/* Link Type Toggle */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Link Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setLinkType("payment")}
              className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                linkType === "payment"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <DollarSign className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Payment Link</div>
                <div className="text-xs">Collect payment + setup autopay</div>
              </div>
              {linkType === "payment" && <Check className="w-5 h-5 ml-auto" />}
            </button>

            <button
              type="button"
              onClick={() => setLinkType("autopay-only")}
              className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                linkType === "autopay-only"
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Autopay Setup Only</div>
                <div className="text-xs">No payment required</div>
              </div>
              {linkType === "autopay-only" && (
                <Check className="w-5 h-5 ml-auto" />
              )}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <form onSubmit={handleCreateLink} className="space-y-4">
            {/* Payment Amount - Only show for payment links */}
            {linkType === "payment" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Auto Insurance Payment - Policy #12345"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* Customer Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) =>
                  setCustomerPhone(e.target.value.replace(/\D/g, ""))
                }
                placeholder="Enter 10-digit phone number"
                required
                maxLength={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Phone number for customer identification
              </p>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Language <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${
                    language === "en"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <Globe className="w-5 h-5" />
                  <span className="font-medium">English</span>
                  {language === "en" && <Check className="w-5 h-5 ml-auto" />}
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage("es")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${
                    language === "es"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <Globe className="w-5 h-5" />
                  <span className="font-medium">Español</span>
                  {language === "es" && <Check className="w-5 h-5 ml-auto" />}
                </button>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {linkType === "autopay-only"
                  ? "Autopay Method"
                  : "Payment Setup Method"}{" "}
                <span className="text-red-500">*</span>
              </label>
              <div
                className={`grid ${
                  linkType === "autopay-only" ? "grid-cols-2" : "grid-cols-3"
                } gap-3`}
              >
                {/* Card Option */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition relative ${
                    paymentMethod === "card"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <CreditCard className="w-6 h-6" />
                  <span className="font-medium text-sm">Card</span>
                  <span className="text-xs text-center">Autopay</span>
                  {paymentMethod === "card" && (
                    <Check className="w-5 h-5 absolute top-2 right-2" />
                  )}
                </button>

                {/* Bank Option */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank")}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition relative ${
                    paymentMethod === "bank"
                      ? "border-green-600 bg-green-50 text-green-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <Building2 className="w-6 h-6" />
                  <span className="font-medium text-sm">Bank</span>
                  <span className="text-xs text-center">Autopay</span>
                  {paymentMethod === "bank" && (
                    <Check className="w-5 h-5 absolute top-2 right-2" />
                  )}
                </button>

                {/* Direct Bill Option - Only for payment links */}
                {linkType === "payment" && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("direct-bill")}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition relative ${
                      paymentMethod === "direct-bill"
                        ? "border-purple-600 bg-purple-50 text-purple-700"
                        : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    <FileText className="w-6 h-6" />
                    <span className="font-medium text-sm">Direct Bill</span>
                    <span className="text-xs text-center">No Autopay</span>
                    {paymentMethod === "direct-bill" && (
                      <Check className="w-5 h-5 absolute top-2 right-2" />
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {linkType === "autopay-only" ? (
                  <>
                    Customer will setup{" "}
                    <strong>
                      {paymentMethod === "card" ? "card" : "bank"}
                    </strong>{" "}
                    autopay
                  </>
                ) : paymentMethod === "direct-bill" ? (
                  <>
                    Customer will <strong>NOT</strong> setup autopay - they will
                    receive bills and pay manually
                  </>
                ) : (
                  <>
                    Customer will be directed to setup{" "}
                    <strong>
                      {paymentMethod === "card" ? "card" : "bank"}
                    </strong>{" "}
                    autopay after payment
                  </>
                )}
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !customerPhone}
              className="w-full px-6 py-3 bg-gradient-to-r from-red-700 to-blue-800 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Link...
                </>
              ) : (
                <>
                  {linkType === "payment" ? (
                    <DollarSign className="w-5 h-5" />
                  ) : (
                    <Link2 className="w-5 h-5" />
                  )}
                  {linkType === "payment"
                    ? "Create Payment Link"
                    : "Create Autopay Link"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Generated Link */}
        {generatedLink && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-green-900">
                {linkType === "payment"
                  ? "Payment Link Created!"
                  : "Autopay Setup Link Created!"}
              </h3>
            </div>

            <div className="bg-white rounded-lg p-4 mb-4 border border-green-200">
              <p className="text-sm text-gray-600 mb-2 font-medium">
                {linkType === "payment"
                  ? "Payment Link:"
                  : "Autopay Setup Link:"}
              </p>
              <p className="text-sm text-gray-800 break-all font-mono bg-gray-50 p-3 rounded">
                {generatedLink}
              </p>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy Link
                </>
              )}
            </button>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-800">
                <strong>ℹ️ Next Steps:</strong> Share this link with your
                customer.{" "}
                {linkType === "autopay-only" ? (
                  <>
                    They will setup{" "}
                    <strong>
                      {paymentMethod === "card" ? "card" : "bank"} autopay
                    </strong>{" "}
                    in{" "}
                    <strong>{language === "en" ? "English" : "Spanish"}</strong>
                    .
                  </>
                ) : paymentMethod === "direct-bill" ? (
                  <>
                    After payment, they&apos;ll see a confirmation message in{" "}
                    <strong>{language === "en" ? "English" : "Spanish"}</strong>{" "}
                    with <strong>no autopay setup required</strong>.
                  </>
                ) : (
                  <>
                    After payment, they&apos;ll setup{" "}
                    <strong>{getPaymentMethodLabel()}</strong> in{" "}
                    <strong>{language === "en" ? "English" : "Spanish"}</strong>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
