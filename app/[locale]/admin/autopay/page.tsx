//app/[locale]/admin/autopay/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface AutopayCustomer {
  _id: string;
  customerName: string;
  customerPhone: string;
  method: string;
  status: string;
  createdAt: string;
  cardLast4?: string;
  cardBrand?: string;
  accountLast4?: string;
  accountType?: string;
  viewed?: boolean;
  completed?: boolean;
}

interface DecryptedData {
  cardNumber?: string;
  cvv?: string;
  cardholderName?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cardBrand?: string;
  zipCode?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountHolderName?: string;
  accountType?: string;
  accountHolderType?: string;
}

interface AdminSession {
  username: string;
  loginTime: number;
  expiresAt: number;
}

export default function AdminAutopayDashboard() {
  const router = useRouter();
  const [customers, setCustomers] = useState<AutopayCustomer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] =
    useState<AutopayCustomer | null>(null);
  const [decryptedData, setDecryptedData] = useState<DecryptedData | null>(
    null,
  );
  const [adminName, setAdminName] = useState("");
  const [showData, setShowData] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [securityCode, setSecurityCode] = useState("");
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [pendingCustomer, setPendingCustomer] =
    useState<AutopayCustomer | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">(
    "pending",
  );
  const [sortByNew, setSortByNew] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const normalizePhoneNumber = (phone: string): string => {
    // Strip all non-digit characters
    return phone.replace(/\D/g, "");
  };

  // Authentication check
  useEffect(() => {
    const checkAuth = () => {
      const savedSession = localStorage.getItem("admin_session");

      if (!savedSession) {
        router.push("/admin");
        return;
      }

      try {
        const session: AdminSession = JSON.parse(savedSession);
        const now = Date.now();

        if (now >= session.expiresAt) {
          localStorage.removeItem("admin_session");
          router.push("/admin");
          return;
        }

        setAdminName(session.username || "Admin");
        setIsCheckingAuth(false);
      } catch (error) {
        console.error("Error checking session:", error);
        localStorage.removeItem("admin_session");
        router.push("/admin");
      }
    };

    checkAuth();

    // Check every minute
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!isCheckingAuth) {
      fetchCustomers(false, currentPage, pageSize, true); // refresh counts on tab/page change

      intervalRef.current = setInterval(() => {
        if (!showData) {
          fetchCustomers(true, currentPage, pageSize, false); // silent poll, no count refresh
        }
      }, 15000); // increase to 15s to reduce flicker

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [showData, isCheckingAuth, activeTab, currentPage, pageSize]);

  // Separate effect for search — always silent so input keeps focus
  // Separate effect for search — debounced + always silent so input keeps focus
  // Separate effect for search — debounced + always silent so input keeps focus
  useEffect(() => {
    if (!isCheckingAuth) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        fetchCustomers(true, 1, pageSize, true); // refresh counts on search
        setCurrentPage(1);
      }, 500);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const fetchCustomers = async (
    silent = false,
    page = currentPage,
    size = pageSize,
    refreshCounts = false,
  ) => {
    if (!silent) setLoading(true);
    try {
      const skip = size === 0 ? 0 : (page - 1) * size;
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: size.toString(),
        tab: activeTab,
        search: searchQuery,
      });
      const response = await fetch(`/api/autopay/list?${params}`);
      const data = await response.json();
      setCustomers(data.customers || []);
      setTotalCount(data.total || 0);
      setNewCount(data.newCount || 0);

      // Only fetch both tab counts when needed (tab change, search, or explicit refresh)
      if (refreshCounts) {
        const [pendingRes, completedRes] = await Promise.all([
          fetch(
            `/api/autopay/list?skip=0&limit=1&tab=pending&search=${encodeURIComponent(searchQuery)}`,
          ),
          fetch(
            `/api/autopay/list?skip=0&limit=1&tab=completed&search=${encodeURIComponent(searchQuery)}`,
          ),
        ]);
        const [pendingData, completedData] = await Promise.all([
          pendingRes.json(),
          completedRes.json(),
        ]);
        setPendingTotal(pendingData.total || 0);
        setCompletedTotal(completedData.total || 0);
      } else {
        // Just update the current active tab count
        if (activeTab === "pending") setPendingTotal(data.total || 0);
        else setCompletedTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async (customer: AutopayCustomer) => {
    if (!adminName?.trim()) {
      alert("Please enter your name for audit logging before viewing data.");
      return;
    }

    // Show code prompt first
    setPendingCustomer(customer);
    setSecurityCode("");
    setShowCodePrompt(true);
  };

  const handleCodeSubmit = async () => {
    try {
      const res = await fetch("/api/verify-security-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: securityCode }),
      });
      const data = await res.json();

      if (!data.valid) {
        alert("Invalid security code.");
        setSecurityCode("");
        return;
      }
    } catch {
      alert("Could not verify code. Please try again.");
      setSecurityCode("");
      return;
    }

    setShowCodePrompt(false);
    setIsCodeVerified(true);

    if (!pendingCustomer) return;
    setSelectedCustomer(pendingCustomer);

    try {
      const response = await fetch("/api/autopay/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: pendingCustomer._id,
          adminName: adminName.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDecryptedData(data.decryptedData);
        setShowData(true);
      } else {
        alert(data.error);
      }
    } catch (_error) {
      console.error("Failed to decrypt data:", _error);
      alert("Failed to decrypt data");
    } finally {
      setPendingCustomer(null);
      setIsCodeVerified(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete autopay info for ${name}? This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/autopay/delete?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setCustomers(customers.filter((c) => c._id !== id));
        alert("Record deleted successfully");
      } else {
        console.log(response);
        alert("Failed to delete record");
      }
    } catch (_error) {
      console.error("Error connecting to server:", _error);
      alert("Error connecting to server");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_session");
    router.push("/admin");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied!");
  };

  const closeModal = () => {
    setShowData(false);
    setDecryptedData(null);
    setSelectedCustomer(null);
  };

  const markAsUnviewed = async (id: string) => {
    try {
      await fetch("/api/autopay/mark-unviewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setCustomers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, viewed: false } : c)),
      );
      // Refresh counts
      fetchCustomers(true, currentPage, pageSize, true);
    } catch {
      alert("Failed to mark as unviewed");
    }
  };

  // Filter customers based on search input (name or phone)
  const toggleCompleted = async (id: string, completed: boolean) => {
    try {
      await fetch("/api/autopay/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed }),
      });
      setCustomers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, completed, viewed: true } : c)),
      );
    } catch {
      alert("Failed to update status");
    }
  };

  const filteredCustomers = customers;
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const pendingCount = pendingTotal;
  const completedCount = completedTotal;

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-600 to-red-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto" />
          <p className="text-gray-600 mt-4">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg font-medium text-gray-600">
          Loading Dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/admin")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2 transition-colors"
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
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Autopay Portal
          </h1>
          <p className="text-gray-500 mt-1">
            Securely manage payment methods linked by phone number.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input
            type="text"
            placeholder="Search Name or Phone..."
            value={searchQuery}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
          />

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between gap-4">
        <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm gap-1">
          <button
            onClick={() => {
              setActiveTab("pending");
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "pending"
                ? "bg-blue-600 text-white shadow"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Pending
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === "pending"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {pendingCount}
            </span>
            {newCount > 0 && activeTab === "pending" && (
              <span className="px-1.5 py-0.5 text-[9px] font-black bg-red-500 text-white rounded animate-pulse">
                {newCount} NEW
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("completed");
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "completed"
                ? "bg-emerald-600 text-white shadow"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Completed
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === "completed"
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {completedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 transition-opacity duration-200">
              <thead className="bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-left">Customer / Phone</th>
                  <th className="px-6 py-4 text-left">Method</th>
                  <th className="px-6 py-4 text-left">Last 4</th>
                  <th className="px-6 py-4 text-left">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 transition-all duration-150">
                {filteredCustomers.map((customer) => {
                  const isNew = !customer.viewed;
                  return (
                    <tr
                      key={customer._id}
                      className={`hover:bg-blue-50/30 transition-colors group ${isNew ? "bg-blue-50/50" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">
                            {customer.customerName}
                          </span>
                          {isNew && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-blue-600 font-mono">
                          {customer.customerPhone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase ${
                            customer.method === "card"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {customer.method}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.method === "card"
                          ? `${customer.cardBrand || "Card"} ••${customer.cardLast4}`
                          : `${customer.accountType || "ACH"} ••${customer.accountLast4}`}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right space-x-3">
                        <button
                          onClick={() => handleDecrypt(customer)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-bold transition-all"
                        >
                          VIEW
                        </button>
                        {customer.viewed && (
                          <button
                            onClick={() => markAsUnviewed(customer._id)}
                            className="text-purple-500 hover:text-purple-700 text-sm font-bold transition-all"
                            title="Mark as unread"
                          >
                            UNREAD
                          </button>
                        )}
                        <button
                          onClick={() =>
                            toggleCompleted(customer._id, !customer.completed)
                          }
                          className={`text-sm font-bold transition-all ${
                            customer.completed
                              ? "text-amber-500 hover:text-amber-700"
                              : "text-emerald-500 hover:text-emerald-700"
                          }`}
                        >
                          {customer.completed ? "REOPEN" : "DONE"}
                        </button>
                        <button
                          onClick={() =>
                            handleDelete(customer._id, customer.customerName)
                          }
                          className="text-gray-300 hover:text-red-600 text-sm font-bold transition-all"
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>All</option>
                </select>
                <span className="ml-2">
                  {pageSize === 0
                    ? `All ${totalCount} records`
                    : `${Math.min((currentPage - 1) * pageSize + 1, totalCount)}–${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
                </span>
              </div>
              {pageSize !== 0 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - currentPage) <= 1,
                    )
                    .reduce<(number | string)[]>((acc, p, i, arr) => {
                      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1)
                        acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "..." ? (
                        <span key={`e-${i}`} className="px-2 text-gray-400">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p as number)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${currentPage === p ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                  >
                    Next ›
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                  >
                    »
                  </button>
                </div>
              )}
            </div>
          )}

          {filteredCustomers.length === 0 && (
            <div className="text-center py-20">
              <div className="text-4xl mb-4">📂</div>
              <div className="text-gray-400 font-medium">
                No matching records found
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Code Modal */}
      <AnimatePresence>
        {showCodePrompt && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="bg-slate-900 p-6 text-white text-center">
                <Shield className="w-10 h-10 mx-auto mb-2 text-amber-400" />
                <h3 className="text-lg font-bold">Security Verification</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter security code to view sensitive data
                </p>
              </div>
              <div className="p-6 space-y-4">
                <input
                  type="password"
                  value={securityCode}
                  onChange={(e) =>
                    setSecurityCode(
                      e.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                  placeholder="Enter 4-digit code"
                  maxLength={4}
                  autoFocus
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCodePrompt(false);
                      setPendingCustomer(null);
                      setSecurityCode("");
                    }}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCodeSubmit}
                    disabled={securityCode.length !== 4}
                    className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition disabled:opacity-40"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Backdrop & Content */}
      <AnimatePresence>
        {showData && decryptedData && selectedCustomer && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-red-600 p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold italic tracking-tighter uppercase">
                    Sensitive Information
                  </h3>
                  <p className="text-xs text-red-100 opacity-80">
                    Sync ID: {selectedCustomer._id}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-3xl hover:rotate-90 transition-transform"
                >
                  &times;
                </button>
              </div>

              <div className="p-6 space-y-5">
                {selectedCustomer.method === "card" ? (
                  <>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                        Full Card Number
                      </label>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-mono text-gray-800 tracking-tighter">
                          {decryptedData.cardNumber}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              decryptedData.cardNumber?.replace(/\s/g, "") ||
                                "",
                            )
                          }
                          className="text-blue-600 text-xs font-bold"
                        >
                          COPY
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Expiration
                        </label>
                        <span className="text-xl font-mono text-gray-800">
                          {decryptedData.expiryMonth}/{decryptedData.expiryYear}
                        </span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          CVV
                        </label>
                        <div className="flex items-center justify-between">
                          <span className="text-xl font-mono text-gray-800">
                            {decryptedData.cvv}
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(decryptedData.cvv || "")
                            }
                            className="text-blue-600 text-xs font-bold"
                          >
                            COPY
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                        Cardholder Name
                      </label>
                      <span className="text-xl font-bold text-gray-800 uppercase italic">
                        {decryptedData.cardholderName}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                        Billing ZIP Code
                      </label>
                      <span className="text-xl font-mono text-gray-800">
                        {decryptedData.zipCode}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                        Account Number
                      </label>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-mono text-gray-800">
                          {decryptedData.accountNumber}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(decryptedData.accountNumber || "")
                          }
                          className="text-blue-600 text-xs font-bold"
                        >
                          COPY
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                        Routing Number
                      </label>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-mono text-gray-800">
                          {decryptedData.routingNumber}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(decryptedData.routingNumber || "")
                          }
                          className="text-blue-600 text-xs font-bold"
                        >
                          COPY
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                        Account Holder
                      </label>
                      <span className="text-xl font-bold text-gray-800 uppercase italic">
                        {decryptedData.accountHolderName}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Account Type
                        </label>
                        <span className="text-lg font-bold text-gray-800 uppercase">
                          {decryptedData.accountType}
                        </span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                          Holder Type
                        </label>
                        <span className="text-lg font-bold text-gray-800 uppercase">
                          {decryptedData.accountHolderType}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-3">
                  {selectedCustomer && !selectedCustomer.completed && (
                    <button
                      onClick={async () => {
                        await toggleCompleted(selectedCustomer._id, true);
                        closeModal();
                      }}
                      className="flex-1 bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg"
                    >
                      ✓ MARK COMPLETE
                    </button>
                  )}
                  <button
                    onClick={closeModal}
                    className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-all shadow-lg"
                  >
                    DONE & SECURE
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
