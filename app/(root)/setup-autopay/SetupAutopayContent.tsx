"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";

type TabType = "card" | "bank";

export default function SetupAutopayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Determine tab mode from URL parameters
  const hasAutopayCard = searchParams.has("autopay_card");
  const hasBankAdded = searchParams.has("bankadded");
  const hasAddAutopay = searchParams.has("addautopay");

  // Determine if tabs should be shown (only for ?addautopay)
  const showTabs = hasAddAutopay;

  // Determine initial tab
  const initialTab: TabType = hasAutopayCard
    ? "card"
    : hasBankAdded
    ? "bank"
    : "card";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Lock tab if specific parameter is used
  const lockedTab = hasAutopayCard ? "card" : hasBankAdded ? "bank" : null;

  const transactionId = searchParams.get("transactionId") || "Unknown";
  const customerName = searchParams.get("name") || "";
  const customerEmail = searchParams.get("email") || "";

  const [agreed, setAgreed] = useState(false);
  const [formData, setFormData] = useState({
    // Card fields
    cardholderName: customerName,
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    zipCode: "",
    country: "United States",

    // Bank fields
    fullName: customerName,
    accountType: "checking",
    accountHolderType: "personal",
    routingNumber: "",
    accountNumber: "",
    confirmAccountNumber: "",
  });

  // ✅ AUTO-TAB FUNCTIONALITY - Card Fields
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, "");
    const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
    setFormData({ ...formData, cardNumber: formatted });

    // Auto-tab when card number complete (16 digits)
    if (value.length === 16) {
      document.getElementById("expiry-month")?.focus();
    }
  };

  const handleExpiryMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 2);
    setFormData({ ...formData, expiryMonth: value });

    // Auto-tab when month complete (2 digits)
    if (value.length === 2) {
      document.getElementById("expiry-year")?.focus();
    }
  };

  const handleExpiryYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setFormData({ ...formData, expiryYear: value });

    // Auto-tab when year complete (4 digits)
    if (value.length === 4) {
      document.getElementById("cvv")?.focus();
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setFormData({ ...formData, cvv: value });

    // Auto-tab when CVV complete (3 or 4 digits for Amex)
    if (value.length === 3 || value.length === 4) {
      document.getElementById("zip-code")?.focus();
    }
  };

  const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 5);
    setFormData({ ...formData, zipCode: value });
  };

  // ✅ AUTO-TAB FUNCTIONALITY - Bank Fields
  const handleRoutingNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 9);
    setFormData({ ...formData, routingNumber: value });

    // Auto-tab when routing number complete (9 digits)
    if (value.length === 9) {
      document.getElementById("account-number")?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      setError("Please agree to the terms to continue");
      return;
    }

    // Validate bank account confirmation
    if (
      activeTab === "bank" &&
      formData.accountNumber !== formData.confirmAccountNumber
    ) {
      setError("Account numbers do not match");
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
          ...(activeTab === "card"
            ? {
                cardNumber: formData.cardNumber,
                expiryMonth: formData.expiryMonth,
                expiryYear: formData.expiryYear,
                cvv: formData.cvv,
                cardholderName: formData.cardholderName,
              }
            : {
                accountNumber: formData.accountNumber,
                routingNumber: formData.routingNumber,
                accountHolderName: formData.fullName,
                accountType: formData.accountType,
              }),
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(
          `/payment-thank-you?transactionId=${transactionId}&autopay=true`
        );
      } else {
        setError(data.error || "Failed to set up autopay");
      }
    } catch (err) {
      console.error("Autopay setup error:", err);
      setError("Failed to set up autopay. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <motion.div
          className="bg-white rounded-lg shadow-lg overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Company Badge - No background, larger logo */}
          <div className="flex flex-col items-center justify-center gap-4 py-8 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Texas Premium Insurance Services"
                width={280}
                height={70}
                className="h-16 w-auto"
              />
            </div>
          </div>

          {/* Tab Navigation - Only show if ?addautopay */}
          {showTabs && (
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setActiveTab("card")}
                className={`flex-1 px-6 py-4 text-left font-medium transition-colors ${
                  activeTab === "card"
                    ? "text-[#C17E3C] border-b-2 border-[#C17E3C] bg-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path
                      fillRule="evenodd"
                      d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Card
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("bank")}
                className={`flex-1 px-6 py-4 text-left font-medium transition-colors ${
                  activeTab === "bank"
                    ? "text-[#C17E3C] border-b-2 border-[#C17E3C] bg-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  US bank account
                </span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mx-6 mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {(lockedTab === "card" || activeTab === "card") && (
              <>
                {/* Cardholder Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name on card
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
                    className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>

                {/* Card Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Card number
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={19}
                      value={formData.cardNumber}
                      onChange={handleCardNumberChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                      placeholder="1234 5678 9012 3456"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                      <Image
                        src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg"
                        alt="Visa"
                        width={32}
                        height={20}
                      />
                      <Image
                        src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                        alt="Mastercard"
                        width={32}
                        height={20}
                      />
                      <Image
                        src="https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg"
                        alt="Amex"
                        width={32}
                        height={20}
                      />
                      <Image
                        src="https://upload.wikimedia.org/wikipedia/commons/5/57/Discover_Card_logo.svg"
                        alt="Discover"
                        width={32}
                        height={20}
                      />
                    </div>
                  </div>
                </div>

                {/* Expiry and CVV Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expiration date
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="expiry-month"
                        type="text"
                        required
                        maxLength={2}
                        placeholder="MM"
                        value={formData.expiryMonth}
                        onChange={handleExpiryMonthChange}
                        className="w-1/2 px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                      />
                      <input
                        id="expiry-year"
                        type="text"
                        required
                        maxLength={4}
                        placeholder="YYYY"
                        value={formData.expiryYear}
                        onChange={handleExpiryYearChange}
                        className="w-1/2 px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Security code
                    </label>
                    <div className="relative">
                      <input
                        id="cvv"
                        type="text"
                        required
                        maxLength={4}
                        value={formData.cvv}
                        onChange={handleCvvChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                        placeholder="123"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg
                          className="w-8 h-6"
                          viewBox="0 0 32 24"
                          fill="currentColor"
                        >
                          <rect
                            x="2"
                            y="4"
                            width="28"
                            height="16"
                            rx="2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                          <rect
                            x="20"
                            y="10"
                            width="8"
                            height="4"
                            rx="1"
                            fill="currentColor"
                          />
                          <text x="22" y="13.5" fontSize="6" fill="white">
                            123
                          </text>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Country and ZIP Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) =>
                        setFormData({ ...formData, country: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    >
                      <option value="United States">United States</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ZIP code
                    </label>
                    <input
                      id="zip-code"
                      type="text"
                      required
                      maxLength={5}
                      value={formData.zipCode}
                      onChange={handleZipCodeChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                      placeholder="12345"
                    />
                  </div>
                </div>
              </>
            )}

            {(lockedTab === "bank" || activeTab === "bank") && (
              <>
                {/* Bank Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account type
                    </label>
                    <select
                      value={formData.accountType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account holder type
                    </label>
                    <select
                      value={formData.accountHolderType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountHolderType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Routing number
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={9}
                    value={formData.routingNumber}
                    onChange={handleRoutingNumberChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    placeholder="123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account number
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
                    className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    placeholder="Account number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm account number
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
                    className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#C17E3C] focus:border-transparent"
                    placeholder="Confirm account number"
                  />
                </div>
              </>
            )}

            {/* Legal Disclaimer */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                By providing your{" "}
                {(lockedTab || activeTab) === "card" ? "card" : "bank account"}{" "}
                information, you allow Texas Premium Insurance Services to
                charge your{" "}
                {(lockedTab || activeTab) === "card" ? "card" : "bank account"}{" "}
                today and authorize your insurance carrier to charge you for
                future payments in accordance with{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C17E3C] underline"
                >
                  these terms
                </a>
                .
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#C17E3C] border-gray-300 rounded focus:ring-[#C17E3C]"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  I agree that I am the applicant or an authorized
                  representative of the applicant. I agree that I fully read and
                  understand the terms of this authorization. I agree to keep
                  Texas Premium Insurance Services and my insurance carrier
                  informed of any changes to my payment information, including
                  updates to my{" "}
                  {(lockedTab || activeTab) === "card"
                    ? "card number, expiration date, or billing address"
                    : "bank account or routing number"}
                  . I understand that any changes to my policy (endorsements)
                  may result in updated payment amounts, and I authorize the
                  carrier to charge the revised amount. I agree that failure to
                  keep Texas Premium Insurance Services and my carrier informed
                  of payment method changes may result in late fees or policy
                  cancellation.
                </span>
              </label>

              <p className="text-sm text-gray-600 mt-4 leading-relaxed">
                By clicking Update Payment Method, I authorize Texas Premium
                Insurance Services and my insurance carrier to automatically
                debit this payment method for future insurance payments when
                they become due. I understand that late fees and payment terms
                vary by carrier.
              </p>
            </div>

            {/* Button - Removed Skip, Single Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading || !agreed}
                className="w-full px-6 py-3 bg-[#C17E3C] text-white font-semibold rounded hover:bg-[#A0103D] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : "Update Payment Method"}
              </button>
            </div>
          </form>
        </motion.div>

        {/* Footer Note */}
        <div className="text-center mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm font-semibold text-gray-700">
              Bank-Grade Security
            </p>
          </div>
          <p className="text-xs text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Protected by military-grade AES-256 encryption. Your payment
            information is secured with the same technology trusted by banks and
            government agencies worldwide.
          </p>
        </div>
      </div>
    </div>
  );
}
