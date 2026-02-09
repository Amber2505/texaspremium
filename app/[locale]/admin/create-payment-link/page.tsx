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
  History,
  Calendar,
  Phone,
  ExternalLink,
  Mail,
  Info,
} from "lucide-react";

type LinkType = "payment" | "autopay-only";
type TabType = "create" | "history";

interface LinkHistory {
  _id: string;
  linkType: LinkType;
  amount: number | null;
  description: string | null;
  customerPhone: string;
  customerEmail?: string; // Optional - comes from Square webhook
  paymentMethod: "card" | "bank" | "direct-bill";
  language: "en" | "es";
  generatedLink: string;
  squareLink?: string;
  createdAt: string;
  createdAtTimestamp: number;
  disabled?: boolean;
}

export default function CreatePaymentLink() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("create");
  const [linkType, setLinkType] = useState<LinkType>("payment");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  // ✅ REMOVED customerEmail state
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "bank" | "direct-bill"
  >("card");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // History state
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLinks, setHistoryLinks] = useState<LinkHistory[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const formatPhoneDisplay = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
      6,
      10
    )}`;
  };

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

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/payment-link-history");
      const data = await response.json();

      if (data.success) {
        setHistoryLinks(data.links);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveToHistory = async (linkData: {
    linkType: LinkType;
    amount?: string;
    description?: string;
    customerPhone: string;
    paymentMethod: "card" | "bank" | "direct-bill";
    language: "en" | "es";
    generatedLink: string;
    squareLink?: string;
  }) => {
    try {
      const response = await fetch("/api/save-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkType: linkData.linkType,
          amount: linkData.amount ? parseFloat(linkData.amount) * 100 : null,
          description: linkData.description || null,
          customerPhone: linkData.customerPhone,
          paymentMethod: linkData.paymentMethod,
          language: linkData.language,
          generatedLink: linkData.generatedLink,
          squareLink: linkData.squareLink || null,
        }),
      });

      const data = await response.json();
      return data.linkId;
    } catch (error) {
      console.error("Error saving to history:", error);
      return null;
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setGeneratedLink("");

    try {
      if (linkType === "autopay-only") {
        if (!customerPhone || paymentMethod === "direct-bill") {
          setError(
            "Please select a valid phone number and autopay method (Card or Bank)"
          );
          setLoading(false);
          return;
        }

        const autopayDirectLink = `https://www.texaspremiumins.com/${language}/setup-autopay?${paymentMethod}&phone=${customerPhone}&redirect=autopay`;

        await saveToHistory({
          linkType: "autopay-only",
          customerPhone,
          paymentMethod,
          language,
          generatedLink: autopayDirectLink,
        });

        setGeneratedLink(autopayDirectLink);
        setLoading(false);
        return;
      }

      const amountInCents = parseFloat(amount) * 100;

      // ✅ REMOVED customerEmail from API call
      const response = await fetch("/api/create-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountInCents,
          description,
          customerPhone,
          // ✅ customerEmail REMOVED - will come from Square webhook
          paymentMethod,
          language,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const squarePaymentLink = data.paymentLink;

        const linkId = await saveToHistory({
          linkType: "payment",
          amount,
          description,
          customerPhone,
          paymentMethod,
          language,
          generatedLink: "placeholder",
          squareLink: squarePaymentLink,
        });

        const proxyLink = `https://www.texaspremiumins.com/${language}/pay/${linkId}`;

        if (linkId) {
          await fetch("/api/update-payment-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkId,
              generatedLink: proxyLink,
            }),
          });
        }

        setGeneratedLink(proxyLink);
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

  const handleCopyHistoryLink = async (link: string, linkId: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLinkId(linkId);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const toggleDisableLink = async (linkId: string, currentStatus: boolean) => {
    try {
      const response = await fetch("/api/toggle-disable-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          disabled: !currentStatus,
        }),
      });

      if (response.ok) {
        fetchHistory();
      }
    } catch (error) {
      console.error("Error toggling link status:", error);
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

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
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
              <h1 className="text-2xl font-bold text-gray-900">
                Payment Links
              </h1>
              <p className="text-gray-600 text-sm">
                Create and manage payment links
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm p-2 mb-6">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                activeTab === "create"
                  ? "bg-gradient-to-r from-red-700 to-blue-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Link2 className="w-5 h-5" />
              Create Link
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                activeTab === "history"
                  ? "bg-gradient-to-r from-red-700 to-blue-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <History className="w-5 h-5" />
              History
            </button>
          </div>
        </div>

        {/* Create Link Tab */}
        {activeTab === "create" && (
          <>
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
                    <div className="text-xs">
                      Collect payment + setup autopay
                    </div>
                  </div>
                  {linkType === "payment" && (
                    <Check className="w-5 h-5 ml-auto" />
                  )}
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

            {/* ✅ INFO BANNER - Email comes from Square */}
            {linkType === "payment" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-900 font-medium mb-1">
                      📧 Email Collection
                    </p>
                    <p className="text-xs text-blue-700">
                      Customer email will be collected automatically during
                      Square checkout. You don&apos;t need to enter it here - it
                      will be captured from the payment!
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                      <p className="text-xs text-gray-500 mt-1">
                        Enter amount with decimals (e.g., 123.45)
                      </p>
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

                    {/* ✅ EMAIL FIELD REMOVED - It comes from Square webhook */}
                  </>
                )}

                {/* Customer Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Phone Number{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formatPhoneDisplay(customerPhone)}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, "");
                      setCustomerPhone(digitsOnly);
                    }}
                    placeholder="(555) 123-4567"
                    required
                    maxLength={14}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter any format - will auto-format to (XXX) XXX-XXXX
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
                      {language === "en" && (
                        <Check className="w-5 h-5 ml-auto" />
                      )}
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
                      {language === "es" && (
                        <Check className="w-5 h-5 ml-auto" />
                      )}
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
                      linkType === "autopay-only"
                        ? "grid-cols-2"
                        : "grid-cols-3"
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
                        Customer will <strong>NOT</strong> setup autopay - they
                        will receive bills and pay manually
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
                        <strong>
                          {language === "en" ? "English" : "Spanish"}
                        </strong>
                        .
                      </>
                    ) : paymentMethod === "direct-bill" ? (
                      <>
                        After payment, they&apos;ll see a confirmation message
                        in{" "}
                        <strong>
                          {language === "en" ? "English" : "Spanish"}
                        </strong>{" "}
                        with <strong>no autopay setup required</strong>.
                      </>
                    ) : (
                      <>
                        After payment, they&apos;ll setup{" "}
                        <strong>{getPaymentMethodLabel()}</strong> in{" "}
                        <strong>
                          {language === "en" ? "English" : "Spanish"}
                        </strong>
                        . Customer email will be captured during checkout.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Link Generation History
              </h2>
              <button
                onClick={fetchHistory}
                disabled={historyLoading}
                className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition flex items-center gap-2"
              >
                {historyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <History className="w-4 h-4" />
                )}
                Refresh
              </button>
            </div>

            {historyLoading && historyLinks.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : historyLinks.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No payment links generated yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Create your first link to see it here
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyLinks.map((link) => (
                  <div
                    key={link._id}
                    className={`border rounded-lg p-4 transition ${
                      link.disabled
                        ? "border-red-300 bg-red-50 opacity-75"
                        : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {link.linkType === "payment" ? (
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              link.disabled ? "bg-gray-200" : "bg-blue-100"
                            }`}
                          >
                            <DollarSign
                              className={`w-5 h-5 ${
                                link.disabled
                                  ? "text-gray-500"
                                  : "text-blue-700"
                              }`}
                            />
                          </div>
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              link.disabled ? "bg-gray-200" : "bg-green-100"
                            }`}
                          >
                            <CreditCard
                              className={`w-5 h-5 ${
                                link.disabled
                                  ? "text-gray-500"
                                  : "text-green-700"
                              }`}
                            />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3
                              className={`font-semibold ${
                                link.disabled
                                  ? "text-gray-500"
                                  : "text-gray-900"
                              }`}
                            >
                              {link.linkType === "payment"
                                ? "Payment Link"
                                : "Autopay Setup"}
                            </h3>
                            {link.disabled && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-200 text-red-800 rounded">
                                DISABLED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {formatDate(link.createdAtTimestamp)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            toggleDisableLink(link._id, link.disabled || false)
                          }
                          className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 ${
                            link.disabled
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {link.disabled ? "Enable" : "Disable"}
                        </button>

                        <button
                          onClick={() =>
                            handleCopyHistoryLink(link.generatedLink, link._id)
                          }
                          disabled={link.disabled}
                          className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 ${
                            link.disabled
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {copiedLinkId === link._id ? (
                            <>
                              <Check className="w-4 h-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      {link.amount && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span
                            className={
                              link.disabled ? "text-gray-500" : "text-gray-700"
                            }
                          >
                            <strong>Amount:</strong> $
                            {(link.amount / 100).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {link.description && (
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <span
                            className={
                              link.disabled ? "text-gray-500" : "text-gray-700"
                            }
                          >
                            <strong>Description:</strong> {link.description}
                          </span>
                        </div>
                      )}

                      {/* ✅ Display Email in History (if available from webhook) */}
                      {link.customerEmail && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span
                            className={
                              link.disabled ? "text-gray-500" : "text-gray-700"
                            }
                          >
                            <strong>Email:</strong> {link.customerEmail}{" "}
                            <span className="text-xs text-blue-600">
                              (from Square)
                            </span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span
                          className={
                            link.disabled ? "text-gray-500" : "text-gray-700"
                          }
                        >
                          <strong>Phone:</strong>{" "}
                          {formatPhoneDisplay(link.customerPhone)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-gray-400" />
                        <span
                          className={
                            link.disabled ? "text-gray-500" : "text-gray-700"
                          }
                        >
                          <strong>Method:</strong>{" "}
                          {link.paymentMethod === "card"
                            ? "Card Autopay"
                            : link.paymentMethod === "bank"
                            ? "Bank Autopay"
                            : "Direct Bill (No Autopay)"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <span
                          className={
                            link.disabled ? "text-gray-500" : "text-gray-700"
                          }
                        >
                          <strong>Language:</strong>{" "}
                          {link.language === "en" ? "English" : "Español"}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`mt-3 pt-3 border-t ${
                        link.disabled ? "border-red-200" : "border-gray-200"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <ExternalLink className="w-4 h-4 text-green-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-green-700 mb-1 uppercase">
                              ✅{" "}
                              {link.linkType === "payment"
                                ? "Share This Link With Customer:"
                                : "Share This Autopay Link With Customer:"}
                            </p>
                            <p className="text-xs text-gray-500 mb-1">
                              (This link goes through validation and can be
                              disabled)
                            </p>
                            <span
                              className={`text-xs font-mono break-all ${
                                link.disabled
                                  ? "text-gray-400"
                                  : "text-gray-900 font-semibold"
                              }`}
                            >
                              {link.generatedLink}
                            </span>
                          </div>
                        </div>

                        {link.squareLink && (
                          <details className="pt-2 border-t border-gray-100">
                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                              ℹ️ Show Square Direct Link (for reference only -
                              don&apos;t share with customers)
                            </summary>
                            <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 rounded">
                              <ExternalLink className="w-4 h-4 text-yellow-600 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-medium text-yellow-800 mb-1">
                                  ⚠️ Square Payment Link (bypasses validation):
                                </p>
                                <p className="text-xs text-yellow-700 mb-1">
                                  This link goes directly to Square and CANNOT
                                  be disabled. Only use for internal reference.
                                </p>
                                <span className="text-xs text-yellow-600 font-mono break-all">
                                  {link.squareLink}
                                </span>
                              </div>
                            </div>
                          </details>
                        )}
                      </div>

                      {link.disabled && (
                        <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded">
                          <p className="text-xs text-red-700 font-medium">
                            ⚠️ This link is DISABLED. Customers clicking the
                            link above will see an error message.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
