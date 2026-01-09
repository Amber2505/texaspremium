"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, Landmark, CreditCard, Loader2 } from "lucide-react";

type TabType = "card" | "bank";

export default function SetupAutopayContent() {
  const t = useTranslations("autopay");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasAutopayCard = searchParams.has("card");
  const hasBankAdded = searchParams.has("bank");

  const initialTab: TabType = hasBankAdded ? "bank" : "card";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const isLocked = hasAutopayCard || hasBankAdded;

  const transactionId = searchParams.get("transactionId") || "Unknown";
  const customerName = searchParams.get("name") || "";
  const customerEmail = searchParams.get("email") || "";
  const customerPhone = searchParams.get("phone") || "";

  // 🔥 NEW: Get redirect destination from URL
  const redirectTo = searchParams.get("redirect") || "autopay";

  const [agreed, setAgreed] = useState(false);
  const [formData, setFormData] = useState({
    cardholderName: customerName,
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    zipCode: "",
    country: "United States",

    fullName: customerName,
    accountType: "checking",
    accountHolderType: "personal",
    routingNumber: "",
    accountNumber: "",
    confirmAccountNumber: "",
  });

  // ✅ AUTO-TAB FUNCTIONALITY
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, "");
    const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
    setFormData({ ...formData, cardNumber: formatted });
    if (value.length === 16) document.getElementById("expiry-month")?.focus();
  };

  const handleExpiryMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 2);
    setFormData({ ...formData, expiryMonth: value });
    if (value.length === 2) document.getElementById("expiry-year")?.focus();
  };

  const handleExpiryYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setFormData({ ...formData, expiryYear: value });
    if (value.length === 4) document.getElementById("cvv")?.focus();
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setFormData({ ...formData, cvv: value });
    if (value.length === 3 || value.length === 4)
      document.getElementById("zip-code")?.focus();
  };

  const handleRoutingNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 9);
    setFormData({ ...formData, routingNumber: value });
    if (value.length === 9) document.getElementById("account-number")?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError(t("errors.agreeToTerms"));
      return;
    }
    if (
      activeTab === "bank" &&
      formData.accountNumber !== formData.confirmAccountNumber
    ) {
      setError(t("errors.accountMismatch"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/save-autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: activeTab,
          transactionId,
          customerName:
            activeTab === "card" ? formData.cardholderName : formData.fullName,
          customerEmail,
          customerPhone,
          ...(activeTab === "card"
            ? {
                cardNumber: formData.cardNumber,
                expiryMonth: formData.expiryMonth,
                expiryYear: formData.expiryYear,
                cvv: formData.cvv,
                zipCode: formData.zipCode,
                cardholderName: formData.cardholderName,
              }
            : {
                accountNumber: formData.accountNumber,
                routingNumber: formData.routingNumber,
                accountHolderName: formData.fullName,
                accountType: formData.accountType,
                accountHolderType: formData.accountHolderType,
              }),
        }),
      });

      const data = await response.json();
      if (data.success) {
        // 🔥 NEW: Conditional redirect based on URL parameter
        if (redirectTo === "payment") {
          router.push(`/payment-thankyou`);
        } else {
          // Default to autopay success page
          router.push(`/autopay-success`);
        }
      } else {
        setError(data.error || t("errors.setupFailed"));
      }
    } catch (err) {
      console.log(err);
      setError(t("errors.setupFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full">
        <motion.div
          className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="bg-[#102a56] py-8 text-center border-b border-gray-200">
            {/* <div className="flex justify-center mb-4">
              <Image
                src="/logo.png"
                alt="Texas Premium Insurance"
                width={240}
                height={60}
                className="h-12 w-auto brightness-0 invert"
              />
            </div> */}
            <h2 className="text-xl font-bold text-white">{t("title")}</h2>
            <p className="text-blue-200 text-sm mt-1">{t("subtitle")}</p>
          </div>

          {/* Navigation Tabs */}
          {!isLocked && (
            <div className="flex p-1 bg-gray-50 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setActiveTab("card")}
                className={`flex-1 flex items-center justify-center py-4 text-sm font-bold rounded-lg transition-all ${
                  activeTab === "card"
                    ? "bg-white shadow text-[#A0103D]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <CreditCard className="w-4 h-4 mr-2" /> {t("tabs.card")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("bank")}
                className={`flex-1 flex items-center justify-center py-4 text-sm font-bold rounded-lg transition-all ${
                  activeTab === "bank"
                    ? "bg-white shadow text-[#A0103D]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Landmark className="w-4 h-4 mr-2" /> {t("tabs.bank")}
              </button>
            </div>
          )}

          {error && (
            <div className="mx-8 mt-6 bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {activeTab === "card" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("card.nameOnCard")}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cardholderName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cardholderName: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder={t("card.namePlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("card.cardNumber")}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={formData.cardNumber}
                    onChange={handleCardNumberChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder={t("card.cardNumberPlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {t("card.expiration")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="expiry-month"
                        type="text"
                        required
                        maxLength={2}
                        placeholder={t("card.monthPlaceholder")}
                        value={formData.expiryMonth}
                        onChange={handleExpiryMonthChange}
                        className="w-1/2 px-4 py-3 border border-gray-200 rounded-xl outline-none"
                      />
                      <input
                        id="expiry-year"
                        type="text"
                        required
                        maxLength={4}
                        placeholder={t("card.yearPlaceholder")}
                        value={formData.expiryYear}
                        onChange={handleExpiryYearChange}
                        className="w-1/2 px-4 py-3 border border-gray-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {t("card.cvv")}
                    </label>
                    <input
                      id="cvv"
                      type="text"
                      required
                      maxLength={4}
                      value={formData.cvv}
                      onChange={handleCvvChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                      placeholder={t("card.cvvPlaceholder")}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("card.zipCode")}
                  </label>
                  <input
                    id="zip-code"
                    type="text"
                    required
                    maxLength={5}
                    value={formData.zipCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        zipCode: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                    placeholder={t("card.zipCodePlaceholder")}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("bank.fullName")}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                    placeholder={t("bank.fullNamePlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {t("bank.accountType")}
                    </label>
                    <select
                      value={formData.accountType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-white font-medium"
                    >
                      <option value="checking">{t("bank.checking")}</option>
                      <option value="savings">{t("bank.savings")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {t("bank.holderType")}
                    </label>
                    <select
                      value={formData.accountHolderType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountHolderType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-white font-medium"
                    >
                      <option value="personal">{t("bank.personal")}</option>
                      <option value="business">{t("bank.business")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("bank.routingNumber")}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={9}
                    value={formData.routingNumber}
                    onChange={handleRoutingNumberChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                    placeholder={t("bank.routingNumberPlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("bank.accountNumber")}
                  </label>
                  <input
                    id="account-number"
                    type="text"
                    required
                    value={formData.accountNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        accountNumber: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {t("bank.confirmAccountNumber")}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.confirmAccountNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmAccountNumber: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none"
                  />
                </div>
              </div>
            )}

            <div className="pt-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 text-[#A0103D] border-gray-300 rounded-md focus:ring-[#A0103D]"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  {t("authorization.text")}{" "}
                  <a
                    href="/terms#purchases-and-payment"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline font-bold"
                  >
                    {t("authorization.termsLink")}
                  </a>
                  .
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreed}
              className="w-full py-4 bg-[#A0103D] hover:bg-[#800d31] text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                t("submitButton")
              )}
            </button>

            <div className="pt-8 border-t border-gray-100">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4 text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-bold text-[10px] uppercase tracking-[0.2em]">
                    {t("security.bankLevel")}
                  </span>
                </div>

                <div className="flex justify-between w-full max-w-sm px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex flex-col items-center flex-1">
                    <Lock className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[9px] font-bold text-gray-500 uppercase">
                      {t("security.ssl")}
                    </span>
                  </div>
                  <div className="w-[1px] bg-gray-200 h-6 self-center" />
                  <div className="flex flex-col items-center flex-1">
                    <span className="text-sm font-black text-gray-700 leading-none">
                      {t("security.pci")}
                    </span>
                    <span className="text-[9px] font-bold text-gray-500 uppercase">
                      {t("security.compliant")}
                    </span>
                  </div>
                  <div className="w-[1px] bg-gray-200 h-6 self-center" />
                  <div className="flex flex-col items-center flex-1">
                    <ShieldCheck className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[9px] font-bold text-gray-500 uppercase">
                      {t("security.encrypted")}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-4 text-center leading-relaxed">
                  {t("security.description")}
                </p>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
