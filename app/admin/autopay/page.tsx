// app\admin\autopay
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface AutopayCustomer {
  _id: string;
  customerName: string;
  customerEmail: string;
  method: string;
  status: string;
  createdAt: string;
  transactionId: string;
  cardLast4?: string;
  cardBrand?: string;
  accountLast4?: string;
  accountType?: string;
}

interface DecryptedData {
  cardNumber?: string;
  cvv?: string;
  cardholderName?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cardBrand?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountHolderName?: string;
  accountType?: string;
}

export default function AdminAutopayDashboard() {
  const [customers, setCustomers] = useState<AutopayCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] =
    useState<AutopayCustomer | null>(null);
  const [decryptedData, setDecryptedData] = useState<DecryptedData | null>(
    null
  );
  const [decrypting, setDecrypting] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [showData, setShowData] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/autopay/list");
      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async (customer: AutopayCustomer) => {
    if (!adminName.trim()) {
      alert("Please enter your name for audit logging");
      return;
    }

    setDecrypting(true);
    setSelectedCustomer(customer);
    setDecryptedData(null);

    try {
      const response = await fetch("/api/autopay/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: customer.customerEmail,
          adminName: adminName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setDecryptedData(data.decryptedData);
        setShowData(true);
      } else {
        alert(data.error || "Failed to decrypt");
      }
    } catch (error) {
      console.error("Decryption error:", error);
      alert("Failed to decrypt data");
    } finally {
      setDecrypting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const closeModal = () => {
    setShowData(false);
    setDecryptedData(null);
    setSelectedCustomer(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Autopay Customers
        </h1>
        <p className="text-gray-600">
          View and manage customer autopay information for carrier websites
        </p>
      </div>

      {/* Admin Name Input */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name (for audit log):
          </label>
          <input
            type="text"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Enter your name"
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Customer List */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last 4
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr key={customer._id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {customer.customerName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {customer.customerEmail}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.method === "card"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {customer.method === "card" ? "💳 Card" : "🏦 Bank"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customer.method === "card"
                      ? `${customer.cardBrand?.toUpperCase() || ""} •••• ${
                          customer.cardLast4
                        }`
                      : `${customer.accountType || ""} •••• ${
                          customer.accountLast4
                        }`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {customer.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleDecrypt(customer)}
                      disabled={decrypting}
                      className="text-blue-600 hover:text-blue-900 font-medium disabled:opacity-50"
                    >
                      🔓 View Full Info
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {customers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No autopay customers yet
            </div>
          )}
        </div>
      </div>

      {/* Decrypted Data Modal */}
      {showData && decryptedData && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {/* Header */}
            <div className="bg-red-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    ⚠️ Sensitive Information
                  </h2>
                  <p className="text-red-100 text-sm mt-1">
                    {selectedCustomer.customerName} -{" "}
                    {selectedCustomer.method.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-white hover:text-red-200 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Warning */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-yellow-400 mt-0.5 mr-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-yellow-800">
                      This is PII (Personally Identifiable Information)
                    </p>
                    <p className="text-sm text-yellow-700">
                      Do not share, screenshot, or store this data. Access is
                      logged.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card Data */}
              {selectedCustomer.method === "card" && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Card Number
                      </label>
                      <button
                        onClick={() =>
                          copyToClipboard(decryptedData.cardNumber || "")
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="font-mono text-lg bg-white p-3 rounded border border-gray-300">
                      {decryptedData.cardNumber}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        Expiry
                      </label>
                      <div className="font-mono text-lg bg-white p-3 rounded border border-gray-300">
                        {decryptedData.expiryMonth}/{decryptedData.expiryYear}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700">
                          CVV
                        </label>
                        <button
                          onClick={() =>
                            copyToClipboard(decryptedData.cvv || "")
                          }
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          📋 Copy
                        </button>
                      </div>
                      <div className="font-mono text-lg bg-white p-3 rounded border border-gray-300">
                        {decryptedData.cvv}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Cardholder Name
                    </label>
                    <div className="text-lg bg-white p-3 rounded border border-gray-300">
                      {decryptedData.cardholderName}
                    </div>
                  </div>
                </div>
              )}

              {/* Bank Data */}
              {selectedCustomer.method === "bank" && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Account Number
                      </label>
                      <button
                        onClick={() =>
                          copyToClipboard(decryptedData.accountNumber || "")
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="font-mono text-lg bg-white p-3 rounded border border-gray-300">
                      {decryptedData.accountNumber}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Routing Number
                      </label>
                      <button
                        onClick={() =>
                          copyToClipboard(decryptedData.routingNumber || "")
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="font-mono text-lg bg-white p-3 rounded border border-gray-300">
                      {decryptedData.routingNumber}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        Account Holder
                      </label>
                      <div className="text-lg bg-white p-3 rounded border border-gray-300">
                        {decryptedData.accountHolderName}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        Account Type
                      </label>
                      <div className="text-lg bg-white p-3 rounded border border-gray-300 capitalize">
                        {decryptedData.accountType}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="pt-4">
                <button
                  onClick={closeModal}
                  className="w-full bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 font-semibold"
                >
                  Close & Clear Data
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
