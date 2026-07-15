// app/admin/create-payment-link/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
  Search,
  Eye,
  X,
} from "lucide-react";
import AdminShell from "../_components/AdminShell";

type LinkType = "payment" | "autopay-only";
type TabType = "create" | "history";

// Square's quick_pay.name hard limit
const DESCRIPTION_MAX = 255;

interface LinkHistory {
  _id: string;
  consentDocumentId?: string;
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
  sentReminders?: string[];
  reEnabledAt?: string;
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
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLanguageChange = async (lang: "en" | "es") => {
    setLanguage(lang);
    if (!description.trim()) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: description, to: lang }),
      });
      const data = await res.json();
      if (data.translated) setDescription(data.translated);
    } catch {
      // silent fail — keep original text
    } finally {
      setTranslating(false);
    }
  };
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

  // Search + pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLinks, setTotalLinks] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">(
    "all",
  );

  // PDF download state
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [unpaidLinks, setUnpaidLinks] = useState<LinkHistory[]>([]);
  const [unpaidFilter, setUnpaidFilter] = useState<"1d" | "1w" | "1m">("1w");
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [copiedUnpaidId, setCopiedUnpaidId] = useState<string | null>(null);

  const fetchUnpaid = async (range: "1d" | "1w" | "1m") => {
    setUnpaidLoading(true);
    try {
      const res = await fetch(`/api/unpaid-links?range=${range}`);
      const data = await res.json();
      if (data.success) setUnpaidLinks(data.links);
    } catch (err) {
      console.error("Unpaid fetch error:", err);
    } finally {
      setUnpaidLoading(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (
      !confirm("Permanently delete this payment link? This cannot be undone.")
    )
      return;
    setDeletingLinkId(linkId);
    try {
      const res = await fetch("/api/delete-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      if (res.ok) {
        setHistoryLinks((prev) => prev.filter((l) => l._id !== linkId));
        setTotalLinks((prev) => prev - 1);
      } else {
        alert("Failed to delete link.");
      }
    } catch {
      alert("Error deleting link.");
    } finally {
      setDeletingLinkId(null);
    }
  };

  const wsRef = useRef<WebSocket | null>(null);
  const generatedLinkRef = useRef<HTMLDivElement>(null);

  // Keep the WS closure from capturing a stale filter
  const unpaidFilterRef = useRef(unpaidFilter);
  useEffect(() => {
    unpaidFilterRef.current = unpaidFilter;
  }, [unpaidFilter]);

  const formatPhoneDisplay = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  // In search mode the server returns all matches; in paginated mode it returns one page
  const filteredLinks = historyLinks;

  const descLength = description.length;
  const descOver = descLength - DESCRIPTION_MAX;
  const descIsOver = descOver > 0;
  const descPct = Math.min(100, (descLength / DESCRIPTION_MAX) * 100);
  const descNearLimit = !descIsOver && descLength > DESCRIPTION_MAX * 0.85;

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
    if (activeTab === "history") fetchHistory(1);
  }, [activeTab]);

  useEffect(() => {
    if (!isCheckingAuth) fetchUnpaid(unpaidFilter);
  }, [isCheckingAuth, unpaidFilter]);

  useEffect(() => {
    if (isCheckingAuth) return;
    const ws = new WebSocket(process.env.NEXT_PUBLIC_RAILWAY_WS_URL!);
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: "join", room: "payment-links-admin" }));
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "paymentLinkUpdated") {
        if (!isSearchMode) fetchHistory(currentPage);
        fetchUnpaid(unpaidFilterRef.current);
      }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [isCheckingAuth]);

  // ── Fetch paginated page ────────────────────────────────────────────────────
  const fetchHistory = async (page = 1, status = statusFilter) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/payment-link-history?page=${page}&status=${status}`,
      );
      const data = await res.json();
      if (data.success) {
        setHistoryLinks(data.links);
        setCurrentPage(data.page);
        setTotalPages(data.totalPages);
        setTotalLinks(data.total);
        setIsSearchMode(false);
        setSearchQuery("");
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Search all records server-side ─────────────────────────────────────────
  const handleSearch = async (q: string, status = statusFilter) => {
    setSearchQuery(q);
    if (!q.trim()) {
      fetchHistory(1, status);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/payment-link-history?search=${encodeURIComponent(q.trim())}&status=${status}`,
      );
      const data = await res.json();
      if (data.success) {
        setHistoryLinks(data.links);
        setTotalLinks(data.total);
        setCurrentPage(1);
        setTotalPages(1);
        setIsSearchMode(true);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearchLoading(false);
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
          amount: parseFloat(amount) * 100,
          description,
          customerPhone,
          paymentMethod,
          language,
          linkId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        // Square rejected it — remove the placeholder row we just created
        try {
          await fetch("/api/delete-payment-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkId }),
          });
        } catch {
          // non-fatal — worst case an orphan row remains
        }
        setError(
          data.error ||
            "Square rejected the request. Check the description length and amount.",
        );
        setLoading(false);
        return;
      }

      {
        const squarePaymentLink = data.paymentLink;
        const squareLinkId = data.squareLinkId || null;
        const proxyLink = `https://www.texaspremiumins.com/${language}/pay/${linkId}`;
        const updateRes = await fetch("/api/update-payment-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId,
            generatedLink: proxyLink,
            squareLink: squarePaymentLink,
            squareLinkId,
          }),
        });

        if (!updateRes.ok) {
          // Real /pay/ link never got written — delete the stub so the
          // reminder job doesn't text "placeholder" to the customer.
          try {
            await fetch("/api/delete-payment-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ linkId }),
            });
          } catch {}
          setError(
            "Link was created but couldn't be finalized. Please try again.",
          );
          setLoading(false);
          return;
        }

        setGeneratedLink(proxyLink);
        fetchUnpaid(unpaidFilter);
        setTimeout(
          () =>
            generatedLinkRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          100,
        );
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
      if (response.ok) fetchHistory(currentPage);
    } catch (error) {
      console.error("Error toggling link status:", error);
    }
  };

  const handleDownloadConsentPdf = async (link: LinkHistory) => {
    setDownloadingPdfId(link._id);
    try {
      if (!link.consentDocumentId && !link.customerEmail) {
        alert("No consent record found for this link.");
        setDownloadingPdfId(null);
        return;
      }
      const params = new URLSearchParams();
      if (link.consentDocumentId) {
        params.set("documentId", link.consentDocumentId);
      } else if (link.customerEmail) {
        params.set("email", link.customerEmail);
        if (link.timestamps?.consent)
          params.set("nearTimestamp", link.timestamps.consent);
        if (link.customerPhone) params.set("phone", link.customerPhone);
      }
      const response = await fetch(`/api/consent-pdf?${params.toString()}`);
      if (response.status === 409) {
        const err = await response.json();
        if (err.ambiguous && err.records?.length > 0) {
          const options = err.records
            .map(
              (r: any, i: number) =>
                `${i + 1}. ${new Date(r.createdAt).toLocaleString()} — $${r.amount} — ****${r.cardLast4}`,
            )
            .join("\n");
          const choice = prompt(
            `Multiple consent records found for this email.\nWhich one do you want?\n\n${options}\n\nEnter the number:`,
          );
          const idx = parseInt(choice || "0", 10) - 1;
          if (idx >= 0 && idx < err.records.length) {
            const retry = await fetch(
              `/api/consent-pdf?documentId=${encodeURIComponent(err.records[idx].documentId)}`,
            );
            if (!retry.ok) {
              alert("Failed to open the selected PDF.");
              return;
            }
            triggerPreview(
              await retry.blob(),
              `Consent_${err.records[idx].documentId.slice(0, 8)}.pdf`,
            );
          }
          return;
        }
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Consent PDF not found for this link.");
        return;
      }
      const filename = link.consentDocumentId
        ? `Consent_${link.consentDocumentId.slice(0, 8)}.pdf`
        : `Consent_${link.customerEmail}.pdf`;
      triggerPreview(await response.blob(), filename);
    } catch (err) {
      console.error("Error opening PDF:", err);
      alert("Failed to open consent PDF.");
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const triggerPreview = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, "_blank");
    if (!newTab) {
      alert(
        "Popup blocked. Please allow popups for this site, or the PDF will download instead.",
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

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
    <AdminShell activePath="/admin/create-payment-link">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
        <div className="max-w-7xl mx-auto flex gap-6 items-start">
          <div className="flex-1 min-w-0 max-w-2xl">
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
                {(["create", "history"] as TabType[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                      activeTab === tab
                        ? "bg-gradient-to-r from-red-700 to-blue-800 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {tab === "create" ? (
                      <>
                        <Link2 className="w-5 h-5" /> Create Link
                      </>
                    ) : (
                      <>
                        <History className="w-5 h-5" /> History
                      </>
                    )}
                  </button>
                ))}
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
                    {[
                      {
                        v: "payment" as LinkType,
                        icon: DollarSign,
                        label: "Payment Link",
                        sub: "Collect payment + setup autopay",
                        color: "blue",
                      },
                      {
                        v: "autopay-only" as LinkType,
                        icon: CreditCard,
                        label: "Autopay Setup Only",
                        sub: "No payment required",
                        color: "green",
                      },
                    ].map(({ v, icon: Icon, label, sub, color }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setLinkType(v)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                          linkType === v
                            ? `border-${color}-600 bg-${color}-50 text-${color}-700`
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <div className="text-left">
                          <div className="font-medium">{label}</div>
                          <div className="text-xs">{sub}</div>
                        </div>
                        {linkType === v && (
                          <Check className="w-5 h-5 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <form onSubmit={handleCreateLink} className="space-y-4">
                    {linkType === "payment" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Payment Amount{" "}
                            <span className="text-red-500">*</span>
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
                              className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                            Description <span className="text-red-500">*</span>
                            {translating && (
                              <span className="flex items-center gap-1 text-xs text-blue-500 font-normal">
                                <Loader2 className="w-3 h-3 animate-spin" />{" "}
                                Translating…
                              </span>
                            )}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="e.g., Customer Name - (Why you sending him the link ? eg Monthly pay, etc)"
                              required
                              disabled={translating}
                              className={`w-full px-4 py-3 pr-20 border rounded-lg outline-none transition disabled:opacity-60 ${
                                descIsOver
                                  ? "border-red-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-red-50/40"
                                  : "border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              }`}
                            />
                            <span
                              className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums transition-colors ${
                                descIsOver
                                  ? "text-red-600"
                                  : descNearLimit
                                    ? "text-amber-600"
                                    : "text-gray-300"
                              }`}
                            >
                              {descLength}/{DESCRIPTION_MAX}
                            </span>
                          </div>
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
                            onClick={() => handleLanguageChange(lang)}
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
                      disabled={
                        loading ||
                        !customerPhone ||
                        (linkType === "payment" && descIsOver)
                      }
                      className="w-full px-6 py-3 bg-gradient-to-r from-red-700 to-blue-800 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Creating
                          Link...
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
                          <Check className="w-5 h-5" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-5 h-5" /> Copy Link
                        </>
                      )}
                    </button>
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-800">
                        <strong>ℹ️ Next Steps:</strong> Share this link with
                        your customer.{" "}
                        {linkType === "autopay-only" ? (
                          <>
                            They will setup{" "}
                            <strong>
                              {paymentMethod === "card" ? "card" : "bank"}{" "}
                              autopay
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
                            .
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
                      {isSearchMode
                        ? `${totalLinks} result${totalLinks !== 1 ? "s" : ""} across all records`
                        : `${totalLinks} total · page ${currentPage} of ${totalPages}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      fetchHistory(1);
                    }}
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
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search all records by phone, email, description, or amount..."
                    className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                  {searchQuery && !searchLoading && (
                    <button
                      onClick={() => handleSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Paid / Unpaid segmented filter */}
                <div className="flex gap-1 mb-5 p-1 bg-gray-100 rounded-lg">
                  {(
                    [
                      { key: "all", label: "All Links" },
                      { key: "paid", label: "Paid" },
                      { key: "unpaid", label: "Unpaid" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setStatusFilter(key);
                        if (searchQuery.trim()) handleSearch(searchQuery, key);
                        else fetchHistory(1, key);
                      }}
                      disabled={historyLoading || searchLoading}
                      className={`flex-1 py-2 text-sm font-semibold rounded-md transition disabled:opacity-60 ${
                        statusFilter === key
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
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
                        onClick={() => handleSearch("")}
                        className="mt-2 text-sm text-blue-500 hover:text-blue-700"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {isSearchMode && searchQuery && (
                      <p className="text-xs text-gray-400 mb-3">
                        {filteredLinks.length} result
                        {filteredLinks.length !== 1 ? "s" : ""} for &quot;
                        {searchQuery}&quot; across all records
                      </p>
                    )}

                    <div className="space-y-4">
                      {filteredLinks.map((link) => (
                        <div
                          key={link._id}
                          className={`border rounded-lg p-4 transition ${link.disabled ? "border-red-300 bg-red-50 opacity-75" : "border-gray-200 hover:border-blue-300"}`}
                        >
                          {/* Card header */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${link.disabled ? "bg-gray-200" : link.linkType === "payment" ? "bg-blue-100" : "bg-green-100"}`}
                              >
                                {link.linkType === "payment" ? (
                                  <DollarSign
                                    className={`w-5 h-5 ${link.disabled ? "text-gray-500" : "text-blue-700"}`}
                                  />
                                ) : (
                                  <CreditCard
                                    className={`w-5 h-5 ${link.disabled ? "text-gray-500" : "text-green-700"}`}
                                  />
                                )}
                              </div>
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
                              {link.completedStages?.consent &&
                                (link.consentDocumentId ||
                                  link.customerEmail) && (
                                  <button
                                    onClick={() =>
                                      handleDownloadConsentPdf(link)
                                    }
                                    disabled={downloadingPdfId === link._id}
                                    className="px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                                  >
                                    {downloadingPdfId === link._id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                    <span className="hidden sm:inline">
                                      View PDF
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
                                className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 ${link.disabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
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
                                className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 ${link.disabled ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                              >
                                {copiedLinkId === link._id ? (
                                  <>
                                    <Check className="w-4 h-4" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4" /> Copy
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteLink(link._id)}
                                disabled={deletingLinkId === link._id}
                                className="px-3 py-1.5 text-sm rounded-lg transition flex items-center gap-1.5 bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                              >
                                {deletingLinkId === link._id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  "Delete"
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Details */}
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
                                    onClick={() =>
                                      handleSaveDescription(link._id)
                                    }
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
                                      setEditingDescValue(
                                        link.description || "",
                                      );
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
                                  link.disabled
                                    ? "text-gray-500"
                                    : "text-gray-700"
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
                                  link.disabled
                                    ? "text-gray-500"
                                    : "text-gray-700"
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
                                  link.disabled
                                    ? "text-gray-500"
                                    : "text-gray-700"
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
                                    ? [
                                        {
                                          key: "autopaySetup",
                                          label: "Autopay",
                                        },
                                      ]
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
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${done ? "bg-green-100 text-green-700" : prevDone ? "bg-blue-50 text-blue-500 ring-1 ring-blue-300" : "bg-gray-100 text-gray-400"}`}
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

                          {/* Link display */}
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
                                    (This link goes through validation and can
                                    be disabled)
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
                                    ℹ️ Show Square Direct Link (for reference
                                    only)
                                  </summary>
                                  <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 rounded">
                                    <ExternalLink className="w-4 h-4 text-yellow-600 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-xs font-medium text-yellow-800 mb-1">
                                        ⚠️ Square Payment Link (bypasses
                                        validation):
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
                                  ⚠️ This link is DISABLED. Customers clicking
                                  the link above will see an error message.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination — only shown in normal (non-search) mode */}
                    {!isSearchMode && totalPages > 1 && (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => fetchHistory(currentPage - 1)}
                          disabled={currentPage <= 1 || historyLoading}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ← Prev
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(
                              (p) =>
                                p === 1 ||
                                p === totalPages ||
                                Math.abs(p - currentPage) <= 1,
                            )
                            .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                              if (
                                idx > 0 &&
                                (p as number) - (arr[idx - 1] as number) > 1
                              )
                                acc.push("…");
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((p, idx) =>
                              p === "…" ? (
                                <span
                                  key={`e-${idx}`}
                                  className="px-1 text-gray-400 text-sm"
                                >
                                  …
                                </span>
                              ) : (
                                <button
                                  key={p}
                                  onClick={() => fetchHistory(p as number)}
                                  disabled={historyLoading}
                                  className={`w-8 h-8 text-sm font-semibold rounded-lg transition ${currentPage === p ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                                >
                                  {p}
                                </button>
                              ),
                            )}
                        </div>
                        <button
                          onClick={() => fetchHistory(currentPage + 1)}
                          disabled={currentPage >= totalPages || historyLoading}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {/* ── RIGHT PANEL: Unpaid / Follow-Up ── */}
          <div className="w-80 flex-shrink-0 sticky top-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Unpaid Links
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Follow-up required
                  </p>
                </div>
                <button
                  onClick={() => fetchUnpaid(unpaidFilter)}
                  disabled={unpaidLoading}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition"
                >
                  {unpaidLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <History className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Filter */}
              <div className="flex gap-1.5 mb-4">
                {(["1d", "1w", "1m"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setUnpaidFilter(r)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                      unpaidFilter === r
                        ? "bg-red-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {r === "1d" ? "Today" : r === "1w" ? "1 Week" : "1 Month"}
                  </button>
                ))}
              </div>

              {/* Count badge */}
              {!unpaidLoading && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                    {unpaidLinks.length} unpaid
                  </span>
                  <span className="text-xs text-gray-400">
                    {unpaidFilter === "1d"
                      ? "last 24 hrs"
                      : unpaidFilter === "1w"
                        ? "last 7 days"
                        : "last 30 days"}
                  </span>
                </div>
              )}

              {/* List */}
              {unpaidLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : unpaidLinks.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">
                    All caught up!
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    No unpaid links in this period
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                  {unpaidLinks.map((link) => {
                    const age = Date.now() - link.createdAtTimestamp;
                    const hours = Math.floor(age / (1000 * 60 * 60));
                    const days = Math.floor(hours / 24);
                    const ageLabel =
                      days > 0 ? `${days}d ago` : `${hours}h ago`;
                    const urgency = link.disabled
                      ? "text-gray-500 bg-gray-50 border-gray-200"
                      : days >= 7
                        ? "text-red-600 bg-red-50 border-red-200"
                        : days >= 3
                          ? "text-orange-600 bg-orange-50 border-orange-200"
                          : "text-yellow-600 bg-yellow-50 border-yellow-200";

                    return (
                      <div
                        key={link._id}
                        className={`border rounded-lg p-3 ${urgency}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold truncate">
                                {formatPhoneDisplay(link.customerPhone)}
                              </p>
                              {link.disabled && (
                                <span className="text-[9px] font-bold px-1 py-0.5 bg-gray-200 text-gray-500 rounded flex-shrink-0">
                                  OFF
                                </span>
                              )}
                            </div>
                            {link.description && (
                              <p className="text-[11px] truncate opacity-80 mt-0.5">
                                {link.description}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-bold flex-shrink-0 opacity-70">
                            {ageLabel}
                          </span>
                        </div>

                        {link.amount && (
                          <p className="text-xs font-bold mb-2">
                            ${(link.amount / 100).toFixed(2)}
                          </p>
                        )}

                        {/* Reminder status */}
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          <span className="text-[10px] font-semibold opacity-70">
                            Reminders:
                          </span>
                          {[
                            { key: "reminder1", label: "1st" },
                            { key: "reminder2", label: "2nd" },
                            { key: "preExpire", label: "3rd" },
                            { key: "lastCall", label: "4th" },
                          ].map(({ key, label }) => {
                            const sent = link.sentReminders?.includes(key);
                            return (
                              <span
                                key={key}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                                  sent
                                    ? "bg-green-200 text-green-800"
                                    : "bg-white/50 opacity-50"
                                }`}
                              >
                                {sent && <Check className="w-2.5 h-2.5" />}
                                {label}
                              </span>
                            );
                          })}
                        </div>

                        {/* Mini progress */}
                        <div className="flex items-center gap-1 mb-3">
                          {[
                            { key: "payment", label: "Paid" },
                            { key: "consent", label: "Consent" },
                          ].map(({ key, label }) => {
                            const done =
                              link.completedStages?.[
                                key as keyof typeof link.completedStages
                              ];
                            return (
                              <span
                                key={key}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  done
                                    ? "bg-green-200 text-green-800"
                                    : "bg-white/60 opacity-60"
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>

                        <p className="text-xs font-mono font-semibold mb-2 opacity-80">
                          {formatPhoneDisplay(link.customerPhone)}
                        </p>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              link.generatedLink,
                            );
                            setCopiedUnpaidId(link._id);
                            setTimeout(() => setCopiedUnpaidId(null), 2000);
                          }}
                          className="w-full py-1.5 text-[11px] font-semibold bg-white/70 hover:bg-white rounded-md transition flex items-center justify-center gap-1"
                        >
                          {copiedUnpaidId === link._id ? (
                            <>
                              <Check className="w-3 h-3" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy Link
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
