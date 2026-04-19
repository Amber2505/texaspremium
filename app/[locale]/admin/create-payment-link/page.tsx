// app/admin/create-payment-link/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
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
  Search,
  FileDown,
  X,
} from "lucide-react";

type LinkType = "payment" | "autopay-only";
type TabType = "create" | "history";

interface LinkHistory {
  _id: string;
  consentDocumentId?: string; // ← session-specific PDF lookup
  linkType: LinkType;
  amount: number | null;
  description: string | null;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: "card" | "bank" | "direct-bill";
  language: "en" | "es";
  generatedLink: string;
  squareLink?: string;
  createdAt: string;
  createdAtTimestamp: number;
  disabled?: boolean;
  currentStage?: string;
  completedStages?: {
    payment?: boolean;
    consent?: boolean;
    autopaySetup?: boolean;
  };
  timestamps?: {
    payment?: string;
    consent?: string;
    autopaySetup?: string;
    completed?: string;
  };
}

export default function CreatePaymentLink() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("create");
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

  // History state
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLinks, setHistoryLinks] = useState<LinkHistory[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editingDescValue, setEditingDescValue] = useState("");
  const [savingDescId, setSavingDescId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // PDF download state
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const generatedLinkRef = useRef<HTMLDivElement>(null);

  const formatPhoneDisplay = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  // Filter history by search query (phone, email, description, amount)
  const filteredLinks = historyLinks.slice(0, 25).filter((link) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      formatPhoneDisplay(link.customerPhone).toLowerCase().includes(q) ||
      link.customerPhone.includes(q.replace(/\D/g, "")) ||
      (link.customerEmail?.toLowerCase().includes(q) ?? false) ||
      (link.description?.toLowerCase().includes(q) ?? false) ||
      (link.amount ? `${(link.amount / 100).toFixed(2)}`.includes(q) : false)
    );
  });

  useEffect(() => {
    const checkAuth = () => {
      const savedSession = localStorage.getItem("admin_session");
      if (!savedSession) {
        window.location.href = "/admin";
        return;
      }
      try {
        const session = JSON.parse(savedSession);
        if (Date.now() >= session.expiresAt) {
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
    if (activeTab === "history") fetchHistory();
  }, [activeTab]);

  useEffect(() => {
    if (isCheckingAuth) return;
    const ws = new WebSocket(process.env.NEXT_PUBLIC_RAILWAY_WS_URL!);
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: "join", room: "payment-links-admin" }));
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "paymentLinkUpdated") {
        fetch("/api/payment-link-history")
          .then((r) => r.json())
          .then((d) => {
            if (d.success) setHistoryLinks(d.links);
          })
          .catch(() => {});
      }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [isCheckingAuth]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/payment-link-history");
      const data = await response.json();
      if (data.success) setHistoryLinks(data.links);
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
            "Please select a valid phone number and autopay method (Card or Bank)",
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
        setTimeout(
          () =>
            generatedLinkRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          100,
        );
        setLoading(false);
        return;
      }

      const amountInCents = parseFloat(amount) * 100;
      const linkId = await saveToHistory({
        linkType: "payment",
        amount,
        description,
        customerPhone,
        paymentMethod,
        language,
        generatedLink: "placeholder",
        squareLink: "pending",
      });

      if (!linkId) {
        setError("Failed to save payment link. Please try again.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/create-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountInCents,
          description,
          customerPhone,
          paymentMethod,
          language,
          linkId,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        const squarePaymentLink = data.paymentLink;
        const squareLinkId = data.squareLinkId || null;
        const proxyLink = `https://www.texaspremiumins.com/${language}/pay/${linkId}`;
        await fetch("/api/update-payment-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId,
            generatedLink: proxyLink,
            squareLink: squarePaymentLink,
            squareLinkId,
          }),
        });
        setGeneratedLink(proxyLink);
        setTimeout(
          () =>
            generatedLinkRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          100,
        );
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

  const handleReset = () => {
    setLinkType("payment");
    setAmount("");
    setDescription("");
    setCustomerPhone("");
    setPaymentMethod("card");
    setLanguage("en");
    setGeneratedLink("");
    setError("");
    setCopied(false);
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

  const handleSaveDescription = async (linkId: string) => {
    setSavingDescId(linkId);
    try {
      const response = await fetch("/api/update-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, description: editingDescValue }),
      });
      if (response.ok) {
        setHistoryLinks((prev) =>
          prev.map((l) =>
            l._id === linkId ? { ...l, description: editingDescValue } : l,
          ),
        );
        setEditingDescId(null);
      } else {
        alert("Failed to update description");
      }
    } catch {
      alert("Error saving description");
    } finally {
      setSavingDescId(null);
    }
  };

  const toggleDisableLink = async (linkId: string, currentStatus: boolean) => {
    try {
      const response = await fetch("/api/toggle-disable-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, disabled: !currentStatus }),
      });
      if (response.ok) fetchHistory();
    } catch (error) {
      console.error("Error toggling link status:", error);
    }
  };

  // Download consent PDF
  // Uses consentDocumentId (session-specific) when available → exact match
  // Falls back to email (returns most recent) for older records without consentDocumentId
  const handleDownloadConsentPdf = async (link: LinkHistory) => {
    setDownloadingPdfId(link._id);
    try {
      if (!link.consentDocumentId && !link.customerEmail) {
        alert("No consent record found for this link.");
        setDownloadingPdfId(null);
        return;
      }

      const param = link.consentDocumentId
        ? `documentId=${encodeURIComponent(link.consentDocumentId)}`
        : `email=${encodeURIComponent(link.customerEmail!)}`;

      const response = await fetch(`/api/admin/consent-pdf?${param}`, {
        headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY || "" },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Consent PDF not found for this link.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = link.consentDocumentId
        ? `Consent_${link.consentDocumentId.slice(0, 8)}.pdf`
        : `Consent_${link.customerEmail}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      alert("Failed to download consent PDF.");
    } finally {
      setDownloadingPdfId(null);
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
    return new Date(timestamp).toLocaleString("en-US", {
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
              <button
                onClick={() => (window.location.href = "/admin")}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Admin
              </button>
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
              <Link2 className="w-5 h-5" /> Create Link
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                activeTab === "history"
                  ? "bg-gradient-to-r from-red-700 to-blue-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <History className="w-5 h-5" /> History
            </button>
          </div>
        </div>

        {/* ── CREATE TAB ── */}
        {activeTab === "create" && (
          <>
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
                      Square checkout. You don&apos;t need to enter it here.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <form onSubmit={handleCreateLink} className="space-y-4">
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
                      <label className="block text-sm font-medium text-gray/700 mb-2">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Phone Number{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formatPhoneDisplay(customerPhone)}
                    onChange={(e) =>
                      setCustomerPhone(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="(555) 123-4567"
                    required
                    maxLength={14}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter any format - will auto-format to (XXX) XXX-XXXX
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Language <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["en", "es"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${
                          language === lang
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <Globe className="w-5 h-5" />
                        <span className="font-medium">
                          {lang === "en" ? "English" : "Español"}
                        </span>
                        {language === lang && (
                          <Check className="w-5 h-5 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    {linkType === "autopay-only"
                      ? "Autopay Method"
                      : "Payment Setup Method"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div
                    className={`grid ${linkType === "autopay-only" ? "grid-cols-2" : "grid-cols-3"} gap-3`}
                  >
                    {[
                      {
                        key: "card",
                        icon: CreditCard,
                        label: "Card",
                        sub: "Autopay",
                        color: "blue",
                      },
                      {
                        key: "bank",
                        icon: Building2,
                        label: "Bank",
                        sub: "Autopay",
                        color: "green",
                      },
                      ...(linkType === "payment"
                        ? [
                            {
                              key: "direct-bill",
                              icon: FileText,
                              label: "Direct Bill",
                              sub: "No Autopay",
                              color: "purple",
                            },
                          ]
                        : []),
                    ].map(({ key, icon: Icon, label, sub, color }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setPaymentMethod(key as typeof paymentMethod)
                        }
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition relative ${
                          paymentMethod === key
                            ? `border-${color}-600 bg-${color}-50 text-${color}-700`
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="font-medium text-sm">{label}</span>
                        <span className="text-xs text-center">{sub}</span>
                        {paymentMethod === key && (
                          <Check className="w-5 h-5 absolute top-2 right-2" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

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
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full px-6 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition flex items-center justify-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reset Form
                </button>
              </form>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {generatedLink && (
              <div
                ref={generatedLinkRef}
                className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6"
              >
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
                        After payment, they&apos;ll see a confirmation in{" "}
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

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Link History
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Showing latest 25 links
                </p>
              </div>
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

            {/* Search Bar */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by phone, email, description, or amount..."
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {historyLoading && historyLinks.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {searchQuery
                    ? "No links match your search"
                    : "No payment links generated yet"}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-2 text-sm text-blue-500 hover:text-blue-700"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                {searchQuery && (
                  <p className="text-xs text-gray-400 mb-3">
                    {filteredLinks.length} result
                    {filteredLinks.length !== 1 ? "s" : ""} for &quot;
                    {searchQuery}&quot;
                  </p>
                )}
                <div className="space-y-4">
                  {filteredLinks.map((link) => (
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
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${link.disabled ? "bg-gray-200" : "bg-blue-100"}`}
                            >
                              <DollarSign
                                className={`w-5 h-5 ${link.disabled ? "text-gray-500" : "text-blue-700"}`}
                              />
                            </div>
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${link.disabled ? "bg-gray-200" : "bg-green-100"}`}
                            >
                              <CreditCard
                                className={`w-5 h-5 ${link.disabled ? "text-gray-500" : "text-green-700"}`}
                              />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3
                                className={`font-semibold ${link.disabled ? "text-gray-500" : "text-gray-900"}`}
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

                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {/* Consent PDF button — only shown when consent done */}
                          {link.completedStages?.consent &&
                            (link.consentDocumentId || link.customerEmail) && (
                              <button
                                onClick={() => handleDownloadConsentPdf(link)}
                                disabled={downloadingPdfId === link._id}
                                title={
                                  link.consentDocumentId
                                    ? "Download exact PDF for this signing session"
                                    : "Download latest consent PDF for this customer (patch consentDocumentId for session-specific)"
                                }
                                className="px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                              >
                                {downloadingPdfId === link._id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <FileDown className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline">
                                  Consent PDF
                                </span>
                              </button>
                            )}

                          <button
                            onClick={() =>
                              toggleDisableLink(
                                link._id,
                                link.disabled || false,
                              )
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
                              handleCopyHistoryLink(
                                link.generatedLink,
                                link._id,
                              )
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
                                link.disabled
                                  ? "text-gray-500"
                                  : "text-gray-700"
                              }
                            >
                              <strong>Amount:</strong> $
                              {(link.amount / 100).toFixed(2)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          {editingDescId === link._id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                value={editingDescValue}
                                onChange={(e) =>
                                  setEditingDescValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleSaveDescription(link._id);
                                  if (e.key === "Escape")
                                    setEditingDescId(null);
                                }}
                                autoFocus
                                className="flex-1 text-sm px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                              <button
                                onClick={() => handleSaveDescription(link._id)}
                                disabled={!!savingDescId}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
                              >
                                {savingDescId === link._id ? "..." : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingDescId(null)}
                                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-between gap-2">
                              <span
                                className={
                                  link.disabled
                                    ? "text-gray-500"
                                    : "text-gray-700"
                                }
                              >
                                <strong>Description:</strong>{" "}
                                {link.description || (
                                  <span className="text-gray-400 italic">
                                    No description
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingDescId(link._id);
                                  setEditingDescValue(link.description || "");
                                }}
                                className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>

                        {link.customerEmail && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span
                              className={
                                link.disabled
                                  ? "text-gray-500"
                                  : "text-gray-700"
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

                      {/* Progress Tracker */}
                      {link.linkType === "payment" && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Customer Progress
                          </p>
                          <div className="flex items-center gap-1">
                            {[
                              { key: "payment", label: "Payment" },
                              { key: "consent", label: "Consent" },
                              ...(link.paymentMethod !== "direct-bill"
                                ? [{ key: "autopaySetup", label: "Autopay" }]
                                : []),
                            ].map(({ key, label }, idx, arr) => {
                              const done =
                                link.completedStages?.[
                                  key as keyof typeof link.completedStages
                                ];
                              const prevDone =
                                idx === 0 ||
                                link.completedStages?.[
                                  arr[idx - 1]
                                    .key as keyof typeof link.completedStages
                                ];
                              return (
                                <div
                                  key={key}
                                  className="flex items-center gap-1"
                                >
                                  {idx > 0 && (
                                    <div
                                      className={`w-4 h-0.5 ${link.completedStages?.[arr[idx - 1].key as keyof typeof link.completedStages] ? "bg-green-300" : "bg-gray-200"}`}
                                    />
                                  )}
                                  <div
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                      done
                                        ? "bg-green-100 text-green-700"
                                        : prevDone
                                          ? "bg-blue-50 text-blue-500 ring-1 ring-blue-300"
                                          : "bg-gray-100 text-gray-400"
                                    }`}
                                  >
                                    {done ? (
                                      <svg
                                        className="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2.5}
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                      </svg>
                                    )}
                                    {label}
                                  </div>
                                </div>
                              );
                            })}
                            {link.timestamps?.completed && (
                              <>
                                <div className="w-4 h-0.5 bg-green-300" />
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                  <svg
                                    className="w-3 h-3"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  Done
                                </div>
                              </>
                            )}
                          </div>

                          {(link.timestamps?.payment ||
                            link.timestamps?.consent ||
                            link.timestamps?.autopaySetup) && (
                            <div className="mt-2 space-y-0.5">
                              {link.timestamps?.payment && (
                                <p className="text-[10px] text-gray-400">
                                  💳 Paid:{" "}
                                  {new Date(
                                    link.timestamps.payment,
                                  ).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </p>
                              )}
                              {link.timestamps?.consent && (
                                <p className="text-[10px] text-gray-400">
                                  📝 Consent:{" "}
                                  {new Date(
                                    link.timestamps.consent,
                                  ).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </p>
                              )}
                              {link.timestamps?.autopaySetup && (
                                <p className="text-[10px] text-gray-400">
                                  🔄 Autopay:{" "}
                                  {new Date(
                                    link.timestamps.autopaySetup,
                                  ).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div
                        className={`mt-3 pt-3 border-t ${link.disabled ? "border-red-200" : "border-gray-200"}`}
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
                                className={`text-xs font-mono break-all ${link.disabled ? "text-gray-400" : "text-gray-900 font-semibold"}`}
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
                                    ⚠️ Square Payment Link (bypasses
                                    validation):
                                  </p>
                                  <p className="text-xs text-yellow-700 mb-1">
                                    This link goes directly to Square and CANNOT
                                    be disabled.
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
