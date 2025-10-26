"use client";

import React, { useState, useEffect, JSX } from "react";
import {
  Calendar,
  Edit,
  Trash2,
  XCircle,
  PlusCircle,
  Bell,
  CheckCircle,
  AlertTriangle,
  Phone,
  Mail,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Ban,
  RotateCcw, // NEW: Icon for reinstate
} from "lucide-react";

type PaymentType = "regular" | "autopay" | "paid-in-full";
type FollowUpStatus = "pending" | "completed" | "skipped";

type FollowUp = {
  date: Date;
  type: string;
  description: string;
  status: FollowUpStatus;
  method?: "phone" | "email" | "sms";
};

type AISuggestion = {
  suggestedDueDate: string;
  suggestedPaymentType: PaymentType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  alternativeDueDate?: string;
  companyPattern?: string;
  pricingAdvantage?: string;
  isMonthToMonth?: boolean;
  policyDuration?: number;
  dataPoints?: {
    sameCompany: number;
    otherCompanies: number;
  };
  companyData?: Array<{
    company: string;
    paymentType: string;
    effectiveDate: string;
    dueDate: string;
    daysBetween: number;
    totalPayments: number;
    remainingPayments: number;
    isMonthToMonth?: boolean;
  }> | null;
};

type Customer = {
  _id?: string;
  id: string;
  name: string;
  dueDate: Date;
  paymentDayOfMonth: number;
  remainingPayments: number;
  totalPayments: number;
  effectiveDate?: Date;
  expirationDate?: Date;
  companyName?: string;
  coverageType?: string;
  status: "active" | "overdue" | "cancelled" | "paid";
  paymentType: PaymentType;
  followUps: FollowUp[];
  lastContact?: Date;
  cancellationDate?: Date;
  cancellationReason?:
    | "non-payment"
    | "customer-choice"
    | "custom-date"
    | "no-followup";
  winBackDate?: Date;
};

type PendingCustomer = {
  _id: string;
  customer_name: string;
  policy_no: string;
  company_name: string;
  coverage_type: string;
  effective_date: string;
  expiration_date: string;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const formatDate = (date: Date, formatStr: string): string => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (formatStr === "MMM dd, yyyy") {
    return `${
      months[date.getMonth()]
    } ${date.getDate()}, ${date.getFullYear()}`;
  } else if (formatStr === "MMM dd") {
    return `${months[date.getMonth()]} ${date.getDate()}`;
  } else if (formatStr === "EEE") {
    return days[date.getDay()];
  } else if (formatStr === "d") {
    return String(date.getDate());
  } else if (formatStr === "yyyy-MM-dd") {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return date.toLocaleDateString();
};

const generateFollowUps = (
  dueDate: Date,
  paymentType: PaymentType
): FollowUp[] => {
  const followUps: FollowUp[] = [];

  if (paymentType === "regular") {
    followUps.push(
      {
        date: addDays(dueDate, -3),
        type: "pre-reminder",
        description: "Upcoming payment reminder",
        status: "pending",
        method: "sms",
      },
      {
        date: dueDate,
        type: "due-date",
        description: "Payment due today",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 5),
        type: "overdue",
        description: "Still unpaid - follow up",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 7),
        type: "overdue",
        description: "Second follow-up",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 9),
        type: "final",
        description: "Final reminder (last day)",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 12),
        type: "post-cancellation",
        description: "First reinstatement opportunity",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 14),
        type: "post-cancellation",
        description: "Second reinstatement opportunity",
        status: "pending",
        method: "phone",
      }
    );
  } else if (paymentType === "autopay") {
    followUps.push(
      {
        date: addDays(dueDate, -3),
        type: "pre-check",
        description: "Check autopay schedule",
        status: "pending",
        method: "sms",
      },
      {
        date: dueDate,
        type: "due-date",
        description: "Confirm autopay succeeded",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 7),
        type: "verification",
        description: "Verify payment posted correctly",
        status: "pending",
        method: "email",
      }
    );
  } else if (paymentType === "paid-in-full") {
    followUps.push({
      date: addDays(dueDate, -20),
      type: "renewal",
      description: "Check renewal pricing & inform",
      status: "pending",
      method: "phone",
    });
  }

  return followUps;
};

export default function InsuranceReminderDashboard() {
  // Helper function to parse YYYY-MM-DD as local date, not UTC
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingCustomer, setCancellingCustomer] = useState<Customer | null>(
    null
  );
  const [cancellationReason, setCancellationReason] = useState<
    "non-payment" | "customer-choice" | "custom-date" | "no-followup"
  >("non-payment");
  const [customWinBackDate, setCustomWinBackDate] = useState("");
  const [cancellationDate, setCancellationDate] = useState("");

  // NEW: Reinstate Modal States
  const [showReinstateModal, setShowReinstateModal] = useState(false);
  const [reinstatingCustomer, setReinstatingCustomer] =
    useState<Customer | null>(null);
  const [reinstatePaymentType, setReinstatePaymentType] =
    useState<PaymentType>("regular");
  const [reinstateDueDate, setReinstateDueDate] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    policyId: "",
    dueDate: "",
    paymentDayOfMonth: "",
    totalPayments: "6",
    paymentType: "regular" as PaymentType,
  });
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>(
    []
  );
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupCustomer, setSetupCustomer] = useState<PendingCustomer | null>(
    null
  );
  const [setupDueDate, setSetupDueDate] = useState("");
  const [setupPaymentType, setSetupPaymentType] =
    useState<PaymentType>("regular");
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [loadingAiSuggestion, setLoadingAiSuggestion] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);
  const [setupEffectiveDate, setSetupEffectiveDate] = useState("");
  const [setupExpirationDate, setSetupExpirationDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const customersPerPage = 10;
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [searchQueries, setSearchQueries] = useState({
    pending: "",
    today: "",
    overdue: "",
    upcoming: "",
    winback: "",
    all: "",
  });
  const [paginationPages, setPaginationPages] = useState({
    today: 1,
    overdue: 1,
    upcoming: 1,
    winback: 1,
    all: 1,
  });

  const [editEffectiveDate, setEditEffectiveDate] = useState("");
  const [editExpirationDate, setEditExpirationDate] = useState("");
  const [editingCustomerDates, setEditingCustomerDates] = useState<
    string | null
  >(null);
  const [editingPendingDates, setEditingPendingDates] = useState<string | null>(
    null
  );
  const [editCustomerEffective, setEditCustomerEffective] = useState("");
  const [editCustomerExpiration, setEditCustomerExpiration] = useState("");

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
    fetchPendingCustomers();
  }, []);
  // Re-fetch AI suggestion when effective or expiration dates change in setup modal
  useEffect(() => {
    if (
      !showSetupModal ||
      !setupCustomer ||
      !setupEffectiveDate ||
      !setupExpirationDate
    ) {
      return;
    }

    const fetchAiSuggestion = async () => {
      try {
        setLoadingAiSuggestion(true);
        setShowAiSuggestion(true); // Show the AI panel
        const aiResponse = await fetch("/api/ai-suggest-due-date", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: setupCustomer.company_name,
            effectiveDate: setupEffectiveDate,
            expirationDate: setupExpirationDate,
          }),
        });

        if (aiResponse.ok) {
          const suggestion = await aiResponse.json();
          console.log("AI Suggestion received:", suggestion);
          setAiSuggestion(suggestion);

          // Always auto-apply high confidence suggestions
          if (suggestion.confidence === "high") {
            console.log(
              "Auto-applying high confidence suggestion:",
              suggestion.suggestedDueDate
            );
            setSetupDueDate(suggestion.suggestedDueDate);
            setSetupPaymentType(suggestion.suggestedPaymentType);
          }
        }
      } catch (error) {
        console.error("Error fetching AI suggestion:", error);
      } finally {
        setLoadingAiSuggestion(false);
      }
    };

    // Debounce the fetch to avoid too many API calls
    const timeoutId = setTimeout(fetchAiSuggestion, 500);
    return () => clearTimeout(timeoutId);
  }, [setupEffectiveDate, setupExpirationDate, showSetupModal, setupCustomer]);

  const fetchPendingCustomers = async () => {
    try {
      // Add cache-busting timestamp to force fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/pending-customers?t=${timestamp}`, {
        cache: "no-store", // Prevent caching
      });
      const data = await response.json();
      setPendingCustomers(data);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error fetching pending customers:", error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers");
      const data = await response.json();
      const customersWithDates = (data as Array<Record<string, unknown>>).map(
        (c) => {
          const parseDate = (dateStr: string | undefined) => {
            if (!dateStr) return undefined;
            const date = new Date(dateStr as string);
            return new Date(
              date.getUTCFullYear(),
              date.getUTCMonth(),
              date.getUTCDate()
            );
          };

          return {
            ...(c as Omit<
              Customer,
              "dueDate" | "followUps" | "effectiveDate" | "expirationDate"
            >),
            dueDate: parseDate(c.dueDate as string | undefined)!,
            effectiveDate: c.effectiveDate // ✅ ADD THIS
              ? parseDate(c.effectiveDate as string | undefined)
              : undefined,
            expirationDate: c.expirationDate // ✅ ADD THIS
              ? parseDate(c.expirationDate as string | undefined)
              : undefined,
            cancellationDate: c.cancellationDate
              ? parseDate(c.cancellationDate as string | undefined)
              : undefined,
            winBackDate: c.winBackDate
              ? parseDate(c.winBackDate as string | undefined)
              : undefined,
            lastContact: c.lastContact
              ? parseDate(c.lastContact as string | undefined)
              : undefined,
            followUps: (c.followUps as Array<Record<string, unknown>>).map(
              (f) => ({
                ...(f as Omit<FollowUp, "date">),
                date: parseDate(f.date as string | undefined)!,
              })
            ),
          } as Customer;
        }
      );
      setCustomers(customersWithDates);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching customers:", error);
      setLoading(false);
    }
  };

  const calculateExpirationDate = (
    effectiveDate: string,
    durationMonths: number
  ): string => {
    if (!effectiveDate) return "";

    const [year, month, day] = effectiveDate.split("-").map(Number);

    // Calculate target year and month
    let targetYear = year;
    let targetMonth = month + durationMonths;

    // Handle year overflow
    while (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }

    // Get the last day of the target month
    const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();

    // Use the original day, or the last day of the month if original day doesn't exist
    const targetDay = Math.min(day, lastDayOfTargetMonth);

    // Format as YYYY-MM-DD
    const resultYear = String(targetYear);
    const resultMonth = String(targetMonth).padStart(2, "0");
    const resultDay = String(targetDay).padStart(2, "0");

    return `${resultYear}-${resultMonth}-${resultDay}`;
  };

  const handleEditPendingDates = (customer: PendingCustomer) => {
    setEditingPendingDates(customer._id);

    const effectiveDateStr = customer.effective_date.split("T")[0];
    const expirationDateStr = customer.expiration_date.split("T")[0];

    setEditEffectiveDate(effectiveDateStr);
    setEditExpirationDate(expirationDateStr);
  };

  const handleEffectiveDateChange = (
    newEffectiveDate: string,
    customer: PendingCustomer
  ) => {
    setEditEffectiveDate(newEffectiveDate);

    if (newEffectiveDate) {
      // Calculate the original policy duration in months
      const originalEffective = new Date(customer.effective_date);
      const originalExpiration = new Date(customer.expiration_date);

      const yearDiff =
        originalExpiration.getFullYear() - originalEffective.getFullYear();
      const monthDiff =
        originalExpiration.getMonth() - originalEffective.getMonth();
      const dayDiff =
        originalExpiration.getDate() - originalEffective.getDate();

      let durationMonths = yearDiff * 12 + monthDiff;

      // If day difference is negative, subtract one month
      if (dayDiff < 0) {
        durationMonths -= 1;
      }

      // Calculate new expiration date based on policy duration
      const suggestedExpiration = calculateExpirationDate(
        newEffectiveDate,
        durationMonths
      );
      setEditExpirationDate(suggestedExpiration);
    }
  };

  const handleSavePendingDates = async (customerId: string) => {
    if (!editEffectiveDate || !editExpirationDate) {
      alert("Please fill in both dates");
      return;
    }

    if (new Date(editExpirationDate) <= new Date(editEffectiveDate)) {
      alert("Expiration date must be after effective date");
      return;
    }

    try {
      console.log("Saving dates for customer:", customerId);

      const response = await fetch(
        `/api/pending-customers/${customerId}/dates`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effective_date: editEffectiveDate,
            expiration_date: editExpirationDate,
          }),
        }
      );

      console.log("Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Update successful:", data);

        // Clear editing state
        setEditingPendingDates(null);
        setEditEffectiveDate("");
        setEditExpirationDate("");

        // Refresh the list
        await fetchPendingCustomers();

        alert("Dates updated successfully!");
      } else {
        // Handle error response
        let errorMessage = "Failed to update dates";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status}`;
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error updating dates:", error);
      alert("Failed to update dates. Please try again.");
    }
  };

  const handleCancelPendingEdit = () => {
    setEditingPendingDates(null);
    setEditEffectiveDate("");
    setEditExpirationDate("");
  };

  const handleEditCustomerDates = (customer: Customer) => {
    setEditingCustomerDates(customer.id);

    if (customer.effectiveDate) {
      const effDate = new Date(customer.effectiveDate);
      const effYear = effDate.getFullYear();
      const effMonth = String(effDate.getMonth() + 1).padStart(2, "0");
      const effDay = String(effDate.getDate()).padStart(2, "0");
      setEditCustomerEffective(`${effYear}-${effMonth}-${effDay}`);
    }

    if (customer.expirationDate) {
      const expDate = new Date(customer.expirationDate);
      const expYear = expDate.getFullYear();
      const expMonth = String(expDate.getMonth() + 1).padStart(2, "0");
      const expDay = String(expDate.getDate()).padStart(2, "0");
      setEditCustomerExpiration(`${expYear}-${expMonth}-${expDay}`);
    }
  };

  const handleCustomerEffectiveDateChange = (
    newEffectiveDate: string,
    customer: Customer
  ) => {
    setEditCustomerEffective(newEffectiveDate);

    if (newEffectiveDate && customer.effectiveDate && customer.expirationDate) {
      // Calculate the original policy duration in months
      const originalEffective = new Date(customer.effectiveDate);
      const originalExpiration = new Date(customer.expirationDate);

      const yearDiff =
        originalExpiration.getFullYear() - originalEffective.getFullYear();
      const monthDiff =
        originalExpiration.getMonth() - originalEffective.getMonth();
      const dayDiff =
        originalExpiration.getDate() - originalEffective.getDate();

      let durationMonths = yearDiff * 12 + monthDiff;

      if (dayDiff < 0) {
        durationMonths -= 1;
      }

      // Calculate new expiration date based on policy duration
      const suggestedExpiration = calculateExpirationDate(
        newEffectiveDate,
        durationMonths
      );
      setEditCustomerExpiration(suggestedExpiration);
    }
  };

  const handleSaveCustomerDates = async (customerId: string) => {
    if (!editCustomerEffective || !editCustomerExpiration) {
      alert("Please fill in both dates");
      return;
    }

    if (new Date(editCustomerExpiration) <= new Date(editCustomerEffective)) {
      alert("Expiration date must be after effective date");
      return;
    }

    try {
      console.log("Saving dates for customer:", customerId);

      const response = await fetch(`/api/customers/${customerId}/dates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effective_date: editCustomerEffective,
          expiration_date: editCustomerExpiration,
        }),
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Update successful:", data);

        // Clear editing state
        setEditingCustomerDates(null);
        setEditCustomerEffective("");
        setEditCustomerExpiration("");

        // Refresh BOTH lists
        await fetchCustomers();
        await fetchPendingCustomers(); // ← ADD THIS to refresh pending customers!

        alert("Dates updated successfully!");
      } else {
        let errorMessage = "Failed to update dates";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status}`;
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error updating dates:", error);
      alert("Failed to update dates. Please try again.");
    }
  };

  const handleCancelCustomerEdit = () => {
    setEditingCustomerDates(null);
    setEditCustomerEffective("");
    setEditCustomerExpiration("");
  };

  const handleSetupReminder = async (customerId: string) => {
    try {
      // Fetch FRESH customer data from MongoDB
      const response = await fetch(`/api/pending-customers/${customerId}`);
      const freshCustomer: PendingCustomer = await response.json();

      console.log("Fresh from MongoDB:", freshCustomer.effective_date);

      setSetupCustomer(freshCustomer);
      setShowSetupModal(true);
      setShowAiSuggestion(true);
      setAiSuggestion(null);

      // Parse and set effective date
      const effectiveDate = new Date(freshCustomer.effective_date);
      const effYear = effectiveDate.getFullYear();
      const effMonth = String(effectiveDate.getMonth() + 1).padStart(2, "0");
      const effDay = String(effectiveDate.getDate()).padStart(2, "0");
      const effDateStr = `${effYear}-${effMonth}-${effDay}`;
      setSetupEffectiveDate(effDateStr);

      // Parse and set expiration date
      const expirationDate = new Date(freshCustomer.expiration_date);
      const expYear = expirationDate.getFullYear();
      const expMonth = String(expirationDate.getMonth() + 1).padStart(2, "0");
      const expDay = String(expirationDate.getDate()).padStart(2, "0");
      const expDateStr = `${expYear}-${expMonth}-${expDay}`;
      setSetupExpirationDate(expDateStr);

      // Note: AI suggestion will be fetched automatically by the useEffect
      // when setupEffectiveDate and setupExpirationDate are set
    } catch {
      alert("Failed to load customer data");
    }
  };

  const handleConfirmSetup = async () => {
    if (
      !setupCustomer ||
      (setupPaymentType !== "paid-in-full" && !setupDueDate)
    ) {
      alert("Please select a due date");
      return;
    }

    console.log("📤 Sending setup request for:", setupCustomer.policy_no);
    console.log("📤 Full customer data:", setupCustomer);

    try {
      const response = await fetch("/api/setup-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyNo: setupCustomer.policy_no,
          dueDate: setupDueDate,
          paymentType: setupPaymentType,
        }),
      });

      if (response.ok) {
        setShowSetupModal(false);
        setSetupCustomer(null);
        setSetupDueDate("");
        setSetupPaymentType("regular");
        fetchCustomers();
        fetchPendingCustomers();
        alert("Payment reminder setup successfully!");
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || `Server error: ${response.status}`;
        console.error("Setup reminder failed:", errorMessage, errorData);
        alert(`Failed to setup reminder: ${errorMessage}`);
      }
    } catch (error) {
      console.error("Error setting up reminder:", error);
      alert(
        `Failed to setup reminder: ${
          error instanceof Error ? error.message : "Network error"
        }`
      );
    }
  };

  const handleChangeToDirectBill = async (customerId: string) => {
    if (
      !confirm(
        "Change this customer from Autopay to Direct Bill? This will regenerate follow-up reminders."
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/change-to-direct-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });

      if (!response.ok) throw new Error("Failed to change payment type");

      fetchCustomers();
      alert("Successfully changed to Direct Bill");
    } catch (error) {
      console.error("Error changing to direct bill:", error);
      alert("Failed to change payment type");
    }
  };

  const handleChangeToAutopay = async (customerId: string) => {
    if (
      !confirm(
        "Change this customer back to Autopay? This will regenerate follow-up reminders."
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/change-to-autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });

      if (!response.ok) throw new Error("Failed to change payment type");

      fetchCustomers();
      alert("Successfully changed to Autopay");
    } catch (error) {
      console.error("Error changing to autopay:", error);
      alert("Failed to change payment type");
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.policyId || !newCustomer.dueDate) {
      alert("Please fill in all required fields");
      return;
    }

    const [year, month, day] = newCustomer.dueDate.split("-").map(Number);
    const dueDate = new Date(year, month - 1, day, 12, 0, 0);

    const paymentDay = newCustomer.paymentDayOfMonth
      ? parseInt(newCustomer.paymentDayOfMonth)
      : dueDate.getDate();

    const customer = {
      id: newCustomer.policyId,
      name: newCustomer.name,
      dueDate: dueDate.toISOString(),
      paymentDayOfMonth: paymentDay,
      remainingPayments: parseInt(newCustomer.totalPayments),
      totalPayments: parseInt(newCustomer.totalPayments),
      status: "active" as const,
      paymentType: newCustomer.paymentType,
      followUps: generateFollowUps(dueDate, newCustomer.paymentType).map(
        (f) => ({
          ...f,
          date: f.date.toISOString(),
        })
      ),
    };

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customer),
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewCustomer({
          name: "",
          policyId: "",
          dueDate: "",
          paymentDayOfMonth: "",
          totalPayments: "6",
          paymentType: "regular",
        });
        fetchCustomers();
      }
    } catch (error) {
      console.error("Error adding customer:", error);
      alert("Failed to add customer");
    }
  };

  const handleCompleteFollowUp = async (
    customerId: string,
    followUpIndex: number
  ) => {
    try {
      await fetch(`/api/customers/${customerId}/followup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpIndex, status: "completed" }),
      });
      fetchCustomers();
    } catch (error) {
      console.error("Error completing follow-up:", error);
    }
  };

  const handleMarkPaid = async (customerId: string) => {
    if (
      !confirm(
        "Mark this payment as paid? This will generate next month's reminders."
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark payment as paid");
      }

      const data = await response.json();

      fetchCustomers();
      alert(data.message || "Payment marked as paid successfully!");
    } catch (error) {
      console.error("Error marking payment:", error);
      alert("Failed to mark payment as paid");
    }
  };

  const handleEditDueDate = (customerId: string) => {
    setEditingCustomer(customerId);
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      const year = customer.dueDate.getFullYear();
      const month = String(customer.dueDate.getMonth() + 1).padStart(2, "0");
      const day = String(customer.dueDate.getDate()).padStart(2, "0");
      setEditDueDate(`${year}-${month}-${day}`);
    }
  };

  const handleSaveDueDate = async () => {
    if (!editingCustomer || !editDueDate) return;

    try {
      const [year, month, day] = editDueDate.split("-").map(Number);
      const dueDate = new Date(year, month - 1, day, 12, 0, 0);

      await fetch(`/api/customers/${editingCustomer}/duedate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: dueDate.toISOString() }),
      });

      setEditingCustomer(null);
      setEditDueDate("");
      fetchCustomers();
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  const handleCancelCustomer = (customer: Customer) => {
    setCancellingCustomer(customer);
    // Set default cancellation date to today
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    setCancellationDate(dateStr);
    setShowCancelModal(true);
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete ${customer.name} (${customer.id})? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await fetch(`/api/customers/${customer.id}/delete`, {
        method: "DELETE",
      });
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert("Failed to delete customer");
    }
  };

  const handleConfirmCancellation = async () => {
    if (!cancellingCustomer) return;

    // Validate cancellation date
    if (!cancellationDate) {
      alert("Please select a cancellation date");
      return;
    }

    const cancellationData: Record<string, unknown> = {
      cancellationReason,
      cancellationDate,
    };

    if (cancellationReason === "custom-date" && customWinBackDate) {
      cancellationData.customWinBackDate = new Date(
        customWinBackDate
      ).toISOString();
    }

    try {
      const response = await fetch(
        `/api/customers/${cancellingCustomer.id}/cancel`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cancellationData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel customer");
      }

      setShowCancelModal(false);
      setCancellingCustomer(null);
      setCancellationReason("non-payment");
      setCustomWinBackDate("");
      setCancellationDate("");
      fetchCustomers();
    } catch (error) {
      console.error("Error cancelling customer:", error);
      alert(
        error instanceof Error ? error.message : "Failed to cancel customer"
      );
    }
  };

  // NEW: Handle Reinstate Click
  const handleReinstateClick = (customer: Customer) => {
    setReinstatingCustomer(customer);
    setReinstatePaymentType("regular");
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    setReinstateDueDate(`${year}-${month}-${day}`);
    setShowReinstateModal(true);
  };

  // NEW: Handle Reinstate Submit
  const handleReinstateSubmit = async () => {
    if (!reinstatingCustomer || !reinstateDueDate) {
      alert("Please fill in all required fields");
      return;
    }

    // ADD THIS LINE TO DEBUG:
    console.log("Reinstating customer:", reinstatingCustomer);
    console.log("Customer _id:", reinstatingCustomer._id);

    try {
      const response = await fetch(
        `/api/customers/${reinstatingCustomer._id}/reinstate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dueDate: reinstateDueDate,
            paymentType: reinstatePaymentType,
          }),
        }
      );

      if (response.ok) {
        await fetchCustomers();

        setShowReinstateModal(false);
        setReinstatingCustomer(null);
        setReinstatePaymentType("regular");
        setReinstateDueDate("");

        alert("Policy reinstated successfully!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error reinstating customer:", error);
      alert("Failed to reinstate policy");
    }
  };

  const getTodayFollowUps = () => {
    const today = new Date();
    const todayFollowUps: Array<{
      customer: Customer;
      followUp: FollowUp;
      index: number;
    }> = [];

    customers.forEach((customer) => {
      customer.followUps.forEach((followUp, index) => {
        if (isSameDay(followUp.date, today) && followUp.status === "pending") {
          todayFollowUps.push({ customer, followUp, index });
        }
      });
    });

    return todayFollowUps;
  };

  const getOverdueFollowUps = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueFollowUps: Array<{
      customer: Customer;
      followUp: FollowUp;
      index: number;
      daysOverdue: number;
    }> = [];

    customers.forEach((customer) => {
      customer.followUps.forEach((followUp, index) => {
        if (followUp.date < today && followUp.status === "pending") {
          const daysOverdue = Math.floor(
            (today.getTime() - followUp.date.getTime()) / (1000 * 60 * 60 * 24)
          );
          overdueFollowUps.push({ customer, followUp, index, daysOverdue });
        }
      });
    });

    return overdueFollowUps.sort(
      (a, b) => a.followUp.date.getTime() - b.followUp.date.getTime()
    );
  };

  const getUpcomingFollowUps = () => {
    const today = new Date();
    const upcomingFollowUps: Array<{
      customer: Customer;
      followUp: FollowUp;
      index: number;
    }> = [];

    customers.forEach((customer) => {
      customer.followUps.forEach((followUp, index) => {
        const diff = Math.floor(
          (followUp.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diff > 0 && diff <= 7 && followUp.status === "pending") {
          upcomingFollowUps.push({ customer, followUp, index });
        }
      });
    });

    return upcomingFollowUps.sort(
      (a, b) => a.followUp.date.getTime() - b.followUp.date.getTime()
    );
  };

  const getWinBackFollowUps = () => {
    const today = new Date();
    const winBackFollowUps: Array<{
      customer: Customer;
      followUp: FollowUp;
      index: number;
    }> = [];

    customers.forEach((customer) => {
      if (customer.status === "cancelled") {
        customer.followUps.forEach((followUp, index) => {
          const diff = Math.floor(
            (followUp.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (
            diff >= -7 &&
            diff <= 30 &&
            followUp.status === "pending" &&
            followUp.type === "win-back"
          ) {
            winBackFollowUps.push({ customer, followUp, index });
          }
        });
      }
    });

    return winBackFollowUps.sort(
      (a, b) => a.followUp.date.getTime() - b.followUp.date.getTime()
    );
  };

  const todayFollowUps = getTodayFollowUps();
  const overdueFollowUps = getOverdueFollowUps();
  const upcomingFollowUps = getUpcomingFollowUps();
  const winBackFollowUps = getWinBackFollowUps();

  // Filter functions for search
  const filterBySearch = (
    items: Array<Record<string, unknown>>,
    query: string,
    section: string
  ) => {
    if (!query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter((item) => {
      const customer =
        section === "pending"
          ? item
          : (item as Record<string, unknown>).customer;
      const name =
        section === "pending"
          ? (customer as Record<string, unknown>).customer_name
          : (customer as Customer).name;
      const policyId =
        section === "pending"
          ? (customer as Record<string, unknown>).policy_no
          : (customer as Customer).id;
      return (
        (name as string)?.toLowerCase().includes(lowerQuery) ||
        (policyId as string)?.toLowerCase().includes(lowerQuery)
      );
    });
  };

  // Apply search filters
  const filteredTodayFollowUps = filterBySearch(
    todayFollowUps,
    searchQueries.today,
    "today"
  ) as typeof todayFollowUps;
  const filteredOverdueFollowUps = filterBySearch(
    overdueFollowUps,
    searchQueries.overdue,
    "overdue"
  ) as typeof overdueFollowUps;
  const filteredUpcomingFollowUps = filterBySearch(
    upcomingFollowUps,
    searchQueries.upcoming,
    "upcoming"
  ) as typeof upcomingFollowUps;
  const filteredWinBackFollowUps = filterBySearch(
    winBackFollowUps,
    searchQueries.winback,
    "winback"
  ) as typeof winBackFollowUps;
  const filteredAllCustomers = customers.filter((c) => {
    if (!searchQueries.all.trim()) return true;
    const query = searchQueries.all.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)
    );
  });

  // Apply search filters for pending customers
  const filteredPendingBySearch = pendingCustomers.filter((c) => {
    if (!searchQueries.pending.trim()) return true;
    const query = searchQueries.pending.toLowerCase();
    return (
      c.customer_name?.toLowerCase().includes(query) ||
      c.policy_no?.toLowerCase().includes(query) ||
      c.company_name?.toLowerCase().includes(query) ||
      c.coverage_type?.toLowerCase().includes(query)
    );
  });

  // Pagination for Today's Follow-ups
  const todayTotalPages = Math.ceil(
    filteredTodayFollowUps.length / customersPerPage
  );
  const todayStartIndex = (paginationPages.today - 1) * customersPerPage;
  const todayEndIndex = todayStartIndex + customersPerPage;
  const currentTodayFollowUps = filteredTodayFollowUps.slice(
    todayStartIndex,
    todayEndIndex
  );

  // Pagination for Overdue Follow-ups
  const overdueTotalPages = Math.ceil(
    filteredOverdueFollowUps.length / customersPerPage
  );
  const overdueStartIndex = (paginationPages.overdue - 1) * customersPerPage;
  const overdueEndIndex = overdueStartIndex + customersPerPage;
  const currentOverdueFollowUps = filteredOverdueFollowUps.slice(
    overdueStartIndex,
    overdueEndIndex
  );

  // Pagination for Upcoming Follow-ups
  const upcomingTotalPages = Math.ceil(
    filteredUpcomingFollowUps.length / customersPerPage
  );
  const upcomingStartIndex = (paginationPages.upcoming - 1) * customersPerPage;
  const upcomingEndIndex = upcomingStartIndex + customersPerPage;
  const currentUpcomingFollowUps = filteredUpcomingFollowUps.slice(
    upcomingStartIndex,
    upcomingEndIndex
  );

  // Pagination for Win-Back Follow-ups
  const winbackStartIndex = (paginationPages.winback - 1) * customersPerPage;
  const winbackEndIndex = winbackStartIndex + customersPerPage;
  const currentWinBackFollowUps = filteredWinBackFollowUps.slice(
    winbackStartIndex,
    winbackEndIndex
  );

  // Pagination for All Customers
  const allTotalPages = Math.ceil(
    filteredAllCustomers.length / customersPerPage
  );
  const allStartIndex = (paginationPages.all - 1) * customersPerPage;
  const allEndIndex = allStartIndex + customersPerPage;
  const currentAllCustomers = filteredAllCustomers.slice(
    allStartIndex,
    allEndIndex
  );

  const uniqueCompanies = Array.from(
    new Set(pendingCustomers.map((c) => c.company_name).filter(Boolean))
  ).sort();

  const filteredPendingCustomers =
    selectedCompany === "all"
      ? filteredPendingBySearch
      : filteredPendingBySearch.filter(
          (c) => c.company_name === selectedCompany
        );

  const totalPages = Math.ceil(
    filteredPendingCustomers.length / customersPerPage
  );
  const startIndex = (currentPage - 1) * customersPerPage;
  const endIndex = startIndex + customersPerPage;
  const currentPendingCustomers = filteredPendingCustomers.slice(
    startIndex,
    endIndex
  );

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);

      // Scroll to pending section after DOM updates
      setTimeout(() => {
        const element = document.getElementById("pending-section");
        if (element) {
          const headerOffset = 20;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition =
            elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      }, 0);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);

      // Scroll to pending section after DOM updates
      setTimeout(() => {
        const element = document.getElementById("pending-section");
        if (element) {
          const headerOffset = 20;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition =
            elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      }, 0);
    }
  };

  const handleCompanyChange = (company: string) => {
    setSelectedCompany(company);
    setCurrentPage(1);
  };

  const handleSearchChange = (section: string, value: string) => {
    setSearchQueries((prev) => ({ ...prev, [section]: value }));
    setPaginationPages((prev) => ({ ...prev, [section]: 1 }));

    // Reset company filter when searching in pending section
    if (section === "pending" && value.trim()) {
      setSelectedCompany("all");
    }
  };

  const handlePageChange = (section: string, newPage: number) => {
    setPaginationPages((prev) => ({ ...prev, [section]: newPage }));

    // Use setTimeout to ensure DOM has updated after state change
    setTimeout(() => {
      // Scroll to the appropriate section
      const sectionId = `${section}-section`;
      const element = document.getElementById(sectionId);
      if (element) {
        const headerOffset = 20; // Offset from top
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }, 0);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Insurance Payment Reminders
              </h1>
              <p className="text-gray-600 mt-1">
                Track and manage customer payment follow-ups
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() =>
                  setView(view === "dashboard" ? "calendar" : "dashboard")
                }
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {view === "dashboard" ? "Calendar View" : "Dashboard View"}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                Add Customer
              </button>
            </div>
          </div>
        </div>

        {view === "dashboard" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                title="Today's Follow-ups"
                value={todayFollowUps.length}
                icon={<Bell className="w-6 h-6 text-blue-600" />}
                color="blue"
              />
              <StatCard
                title="Overdue Follow-ups"
                value={overdueFollowUps.length}
                icon={<AlertTriangle className="w-6 h-6 text-red-600" />}
                color="red"
              />
              <StatCard
                title="Upcoming (7 days)"
                value={upcomingFollowUps.length}
                icon={<Calendar className="w-6 h-6 text-green-600" />}
                color="green"
              />
            </div>

            {pendingCustomers.length > 0 && (
              <div
                id="pending-section"
                className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl shadow-sm p-6 mb-6 border-2 border-yellow-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-yellow-600" />
                    Pending Customers - Setup Payment Reminders (
                    {filteredPendingCustomers.length}
                    {selectedCompany !== "all" &&
                      ` of ${pendingCustomers.length}`}
                    )
                  </h2>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">
                      Filter by Company:
                    </label>
                    <select
                      value={selectedCompany}
                      onChange={(e) => handleCompanyChange(e.target.value)}
                      className="border border-yellow-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    >
                      <option value="all">
                        All Companies ({pendingCustomers.length})
                      </option>
                      {uniqueCompanies.map((company) => {
                        const count = pendingCustomers.filter(
                          (c) => c.company_name === company
                        ).length;
                        return (
                          <option key={company} value={company}>
                            {company} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search by name, policy number, company, or coverage type..."
                    value={searchQueries.pending}
                    onChange={(e) =>
                      handleSearchChange("pending", e.target.value)
                    }
                    className="w-full border border-yellow-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                  />
                </div>

                {filteredPendingCustomers.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {searchQueries.pending || selectedCompany !== "all"
                      ? "No matching customers found"
                      : "No pending customers"}
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {currentPendingCustomers.map((customer) => {
                        // Parse dates correctly - treat as UTC dates
                        const effectiveDateStr =
                          customer.effective_date.split("T")[0]; // Get YYYY-MM-DD
                        const expirationDateStr =
                          customer.expiration_date.split("T")[0]; // Get YYYY-MM-DD

                        const [effYear, effMonth, effDay] = effectiveDateStr
                          .split("-")
                          .map(Number);
                        const [expYear, expMonth, expDay] = expirationDateStr
                          .split("-")
                          .map(Number);

                        const effectiveDate = new Date(
                          effYear,
                          effMonth - 1,
                          effDay
                        ); // Month is 0-indexed
                        const expirationDate = new Date(
                          expYear,
                          expMonth - 1,
                          expDay
                        );

                        // Calculate exact month difference
                        const yearDiff =
                          expirationDate.getFullYear() -
                          effectiveDate.getFullYear();
                        const monthDiff =
                          expirationDate.getMonth() - effectiveDate.getMonth();
                        const dayDiff =
                          expirationDate.getDate() - effectiveDate.getDate();

                        let diffMonths = yearDiff * 12 + monthDiff;

                        if (dayDiff < 0) {
                          diffMonths -= 1;
                        }

                        const policyDuration =
                          diffMonths >= 12
                            ? "12 months"
                            : `${diffMonths} months`;

                        const isEditingDates =
                          editingPendingDates === customer._id;

                        return (
                          <div
                            key={customer._id}
                            className="border border-yellow-200 rounded-lg p-4 bg-white hover:shadow-md transition"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                    NEW
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Policy Duration: {policyDuration}
                                  </span>
                                </div>
                                <h3 className="font-semibold text-gray-900 text-lg">
                                  {customer.customer_name}
                                </h3>
                                <p className="text-sm text-gray-600">
                                  Policy #: {customer.policy_no}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Company: {customer.company_name}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Coverage: {customer.coverage_type}
                                </p>

                                {isEditingDates ? (
                                  <div className="mt-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs text-gray-600 w-20">
                                        Effective:
                                      </label>
                                      <input
                                        type="date"
                                        value={editEffectiveDate}
                                        onChange={(e) =>
                                          handleEffectiveDateChange(
                                            e.target.value,
                                            customer
                                          )
                                        }
                                        className="border border-yellow-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs text-gray-600 w-20">
                                        Expiration:
                                      </label>
                                      <input
                                        type="date"
                                        value={editExpirationDate}
                                        onChange={(e) =>
                                          setEditExpirationDate(e.target.value)
                                        }
                                        className="border border-yellow-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                                      />
                                      <span className="text-xs text-gray-500 italic">
                                        (Auto-filled based on {policyDuration}{" "}
                                        policy)
                                      </span>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() =>
                                          handleSavePendingDates(customer._id)
                                        }
                                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={handleCancelPendingEdit}
                                        className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 transition"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-gray-500">
                                      Effective:{" "}
                                      {formatDate(
                                        effectiveDate,
                                        "MMM dd, yyyy"
                                      )}{" "}
                                      - Expiration:{" "}
                                      {formatDate(
                                        expirationDate,
                                        "MMM dd, yyyy"
                                      )}
                                    </p>
                                    <button
                                      onClick={() =>
                                        handleEditPendingDates(customer)
                                      }
                                      className="p-1 hover:bg-yellow-100 rounded"
                                      title="Edit Dates"
                                    >
                                      <Edit className="w-3 h-3 text-yellow-600" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  handleSetupReminder(customer._id)
                                }
                                className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition flex items-center gap-2"
                              >
                                <Calendar className="w-4 h-4" />
                                Setup Reminder
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {totalPages > 1 && (
                      <div className="mt-6 flex items-center justify-between border-t border-yellow-200 pt-4">
                        <div className="text-sm text-gray-600">
                          Showing {startIndex + 1} to{" "}
                          {Math.min(endIndex, filteredPendingCustomers.length)}{" "}
                          of {filteredPendingCustomers.length} customers
                          {selectedCompany !== "all" &&
                            ` (filtered by ${selectedCompany})`}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-white border border-yellow-300 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                          </button>
                          <span className="text-sm text-gray-700 px-3">
                            Page {currentPage} of {totalPages}
                          </span>
                          <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div
              id="today-section"
              className="bg-white rounded-xl shadow-sm p-6 mb-6"
            >
              <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                Today&apos;s Follow-ups ({filteredTodayFollowUps.length})
              </h2>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by name or policy number..."
                  value={searchQueries.today}
                  onChange={(e) => handleSearchChange("today", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {filteredTodayFollowUps.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {searchQueries.today
                    ? "No matching follow-ups found"
                    : "No follow-ups scheduled for today"}
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {currentTodayFollowUps.map(
                      ({ customer, followUp, index }) => (
                        <FollowUpCard
                          key={`${customer.id}-${index}`}
                          customer={customer}
                          followUp={followUp}
                          onComplete={() =>
                            handleCompleteFollowUp(customer.id, index)
                          }
                          onMarkPaid={() => handleMarkPaid(customer.id)}
                          onChangeToDirectBill={handleChangeToDirectBill}
                        />
                      )
                    )}
                  </div>

                  {todayTotalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                      <div className="text-sm text-gray-600">
                        Showing {todayStartIndex + 1} to{" "}
                        {Math.min(todayEndIndex, filteredTodayFollowUps.length)}{" "}
                        of {filteredTodayFollowUps.length} follow-ups
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            handlePageChange("today", paginationPages.today - 1)
                          }
                          disabled={paginationPages.today === 1}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </button>
                        <span className="text-sm text-gray-700 px-3">
                          Page {paginationPages.today} of {todayTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            handlePageChange("today", paginationPages.today + 1)
                          }
                          disabled={paginationPages.today === todayTotalPages}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {overdueFollowUps.length > 0 && (
              <div
                id="overdue-section"
                className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl shadow-sm p-6 mb-6 border-2 border-red-200"
              >
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Overdue Follow-ups ({filteredOverdueFollowUps.length})
                </h2>

                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search by name or policy number..."
                    value={searchQueries.overdue}
                    onChange={(e) =>
                      handleSearchChange("overdue", e.target.value)
                    }
                    className="w-full border border-red-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {filteredOverdueFollowUps.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No matching overdue follow-ups found
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {currentOverdueFollowUps.map(
                        ({ customer, followUp, index, daysOverdue }) => (
                          <div
                            key={`${customer.id}-${index}`}
                            className="border border-red-200 rounded-lg p-4 bg-white hover:shadow-md transition"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                    {daysOverdue}{" "}
                                    {daysOverdue === 1 ? "DAY" : "DAYS"} OVERDUE
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Due:{" "}
                                    {formatDate(followUp.date, "MMM dd, yyyy")}
                                  </span>
                                  <span className="flex items-center gap-1 text-sm text-gray-600">
                                    {followUp.method === "phone" && (
                                      <Phone className="w-4 h-4" />
                                    )}
                                    {followUp.method === "email" && (
                                      <Mail className="w-4 h-4" />
                                    )}
                                    {followUp.method === "sms" && (
                                      <MessageSquare className="w-4 h-4" />
                                    )}
                                    {followUp.method}
                                  </span>
                                </div>
                                <h3 className="font-semibold text-gray-900">
                                  {customer.name}
                                </h3>
                                <p className="text-sm text-gray-600">
                                  Policy: {customer.id}
                                </p>
                                <p className="text-sm text-gray-700 mt-1">
                                  {followUp.description}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Payment{" "}
                                  {customer.totalPayments -
                                    customer.remainingPayments +
                                    1}{" "}
                                  of {customer.totalPayments}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleMarkPaid(customer.id)}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                                >
                                  Mark Paid
                                </button>
                                <button
                                  onClick={() =>
                                    handleCompleteFollowUp(customer.id, index)
                                  }
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                                >
                                  Complete
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    {overdueTotalPages > 1 && (
                      <div className="mt-6 flex items-center justify-between border-t border-red-200 pt-4">
                        <div className="text-sm text-gray-600">
                          Showing {overdueStartIndex + 1} to{" "}
                          {Math.min(
                            overdueEndIndex,
                            filteredOverdueFollowUps.length
                          )}{" "}
                          of {filteredOverdueFollowUps.length} follow-ups
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handlePageChange(
                                "overdue",
                                paginationPages.overdue - 1
                              )
                            }
                            disabled={paginationPages.overdue === 1}
                            className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                          </button>
                          <span className="text-sm text-gray-700 px-3">
                            Page {paginationPages.overdue} of{" "}
                            {overdueTotalPages}
                          </span>
                          <button
                            onClick={() =>
                              handlePageChange(
                                "overdue",
                                paginationPages.overdue + 1
                              )
                            }
                            disabled={
                              paginationPages.overdue === overdueTotalPages
                            }
                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div
              id="upcoming-section"
              className="bg-white rounded-xl shadow-sm p-6 mb-6"
            >
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Upcoming Follow-ups (Next 7 Days) (
                {filteredUpcomingFollowUps.length})
              </h2>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by name or policy number..."
                  value={searchQueries.upcoming}
                  onChange={(e) =>
                    handleSearchChange("upcoming", e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {filteredUpcomingFollowUps.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {searchQueries.upcoming
                    ? "No matching upcoming follow-ups found"
                    : "No upcoming follow-ups"}
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {currentUpcomingFollowUps.map(
                      ({ customer, followUp, index }) => (
                        <FollowUpCard
                          key={`${customer.id}-${index}`}
                          customer={customer}
                          followUp={followUp}
                          onComplete={() =>
                            handleCompleteFollowUp(customer.id, index)
                          }
                          onMarkPaid={() => handleMarkPaid(customer.id)}
                          onChangeToDirectBill={handleChangeToDirectBill}
                          isUpcoming
                        />
                      )
                    )}
                  </div>

                  {upcomingTotalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                      <div className="text-sm text-gray-600">
                        Showing {upcomingStartIndex + 1} to{" "}
                        {Math.min(
                          upcomingEndIndex,
                          filteredUpcomingFollowUps.length
                        )}{" "}
                        of {filteredUpcomingFollowUps.length} follow-ups
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            handlePageChange(
                              "upcoming",
                              paginationPages.upcoming - 1
                            )
                          }
                          disabled={paginationPages.upcoming === 1}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </button>
                        <span className="text-sm text-gray-700 px-3">
                          Page {paginationPages.upcoming} of{" "}
                          {upcomingTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            handlePageChange(
                              "upcoming",
                              paginationPages.upcoming + 1
                            )
                          }
                          disabled={
                            paginationPages.upcoming === upcomingTotalPages
                          }
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {winBackFollowUps.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border-2 border-purple-200">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  Win-Back Opportunities ({winBackFollowUps.length})
                </h2>
                <div className="space-y-3">
                  {currentWinBackFollowUps.map(
                    ({ customer, followUp, index }) => (
                      <div
                        key={`${customer.id}-${index}`}
                        className="border border-purple-200 rounded-lg p-4 bg-purple-50"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="px-3 py-1 rounded-full text-xs font-medium border bg-purple-100 text-purple-800 border-purple-200">
                                WIN-BACK
                              </span>
                              <span className="text-xs text-gray-500">
                                Cancelled:{" "}
                                {formatDate(
                                  customer.cancellationDate!,
                                  "MMM dd, yyyy"
                                )}
                              </span>
                              <span className="text-xs text-gray-600 font-medium">
                                Reason:{" "}
                                {customer.cancellationReason === "non-payment"
                                  ? "Non-Payment"
                                  : customer.cancellationReason ===
                                    "customer-choice"
                                  ? "Customer Choice"
                                  : customer.cancellationReason ===
                                    "custom-date"
                                  ? "Custom Date"
                                  : "No Follow-up"}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900">
                              {customer.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Policy: {customer.id}
                            </p>
                            <p className="text-sm text-gray-700 mt-1">
                              {followUp.description}
                            </p>
                            <p className="text-sm text-purple-700 mt-1 font-medium">
                              Contact on:{" "}
                              {formatDate(followUp.date, "MMM dd, yyyy")}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              handleCompleteFollowUp(customer.id, index)
                            }
                            className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition"
                          >
                            Complete
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            <div id="all-section" className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                All Customers ({filteredAllCustomers.length})
              </h2>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by name or policy number..."
                  value={searchQueries.all}
                  onChange={(e) => handleSearchChange("all", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {filteredAllCustomers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No matching customers found
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {currentAllCustomers.map((customer) => (
                      <CustomerCard
                        key={customer.id}
                        customer={customer}
                        onEditDueDate={handleEditDueDate}
                        onCancelCustomer={handleCancelCustomer}
                        onDeleteCustomer={handleDeleteCustomer}
                        onChangeToAutopay={handleChangeToAutopay}
                        onChangeToDirectBill={handleChangeToDirectBill}
                        onReinstate={handleReinstateClick}
                        isEditing={editingCustomer === customer.id}
                        editDueDate={editDueDate}
                        setEditDueDate={setEditDueDate}
                        onSaveDueDate={handleSaveDueDate}
                        onCancelEdit={() => setEditingCustomer(null)}
                        // ✅ ADD THESE NEW PROPS
                        isEditingDates={editingCustomerDates === customer.id}
                        editCustomerEffective={editCustomerEffective}
                        editCustomerExpiration={editCustomerExpiration}
                        onEditCustomerDates={handleEditCustomerDates}
                        onCustomerEffectiveDateChange={
                          handleCustomerEffectiveDateChange
                        }
                        onSaveCustomerDates={handleSaveCustomerDates}
                        onCancelCustomerEdit={handleCancelCustomerEdit}
                        setEditCustomerExpiration={setEditCustomerExpiration}
                      />
                    ))}
                  </div>

                  {allTotalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                      <div className="text-sm text-gray-600">
                        Showing {allStartIndex + 1} to{" "}
                        {Math.min(allEndIndex, filteredAllCustomers.length)} of{" "}
                        {filteredAllCustomers.length} customers
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            handlePageChange("all", paginationPages.all - 1)
                          }
                          disabled={paginationPages.all === 1}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </button>
                        <span className="text-sm text-gray-700 px-3">
                          Page {paginationPages.all} of {allTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            handlePageChange("all", paginationPages.all + 1)
                          }
                          disabled={paginationPages.all === allTotalPages}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <WeekCalendarView
            customers={customers}
            onCompleteFollowUp={handleCompleteFollowUp}
          />
        )}

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4 text-gray-900">
                Add New Customer
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, name: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy ID *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.policyId}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        policyId: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="POL-2401"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Payment Due Date *
                  </label>
                  <input
                    type="date"
                    value={newCustomer.dueDate}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        dueDate: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Payments
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={newCustomer.totalPayments}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        totalPayments: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Type
                  </label>
                  <select
                    value={newCustomer.paymentType}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        paymentType: e.target.value as PaymentType,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="regular">Regular</option>
                    <option value="autopay">Autopay</option>
                    <option value="paid-in-full">Paid in Full</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewCustomer({
                      name: "",
                      policyId: "",
                      dueDate: "",
                      paymentDayOfMonth: "",
                      totalPayments: "6",
                      paymentType: "regular",
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomer}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Add Customer
                </button>
              </div>
            </div>
          </div>
        )}

        {showCancelModal && cancellingCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-4 text-gray-900">
                Cancel Customer Policy
              </h3>
              <p className="text-gray-700 mb-4">
                Cancel policy for <strong>{cancellingCustomer.name}</strong> (
                {cancellingCustomer.id})?
              </p>

              {/* Cancellation Date Field */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cancellation Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={cancellationDate}
                  onChange={(e) => setCancellationDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  The actual date when the policy was/will be cancelled
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cancellation Reason & Follow-up
                </label>
                <div className="space-y-3">
                  <label className="flex items-start">
                    <input
                      type="radio"
                      name="reason"
                      value="non-payment"
                      checked={cancellationReason === "non-payment"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCancellationReason(
                          e.target.value as
                            | "non-payment"
                            | "customer-choice"
                            | "custom-date"
                            | "no-followup"
                        )
                      }
                      className="mr-2 mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      Non-Payment{" "}
                      <span className="text-gray-500">
                        (Follow up at 3 & 6 months from cancellation date)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start">
                    <input
                      type="radio"
                      name="reason"
                      value="customer-choice"
                      checked={cancellationReason === "customer-choice"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCancellationReason(
                          e.target.value as
                            | "non-payment"
                            | "customer-choice"
                            | "custom-date"
                            | "no-followup"
                        )
                      }
                      className="mr-2 mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      Customer Choice{" "}
                      <span className="text-gray-500">
                        (Follow up 15 days before 6 months, then at 6 months)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start">
                    <input
                      type="radio"
                      name="reason"
                      value="custom-date"
                      checked={cancellationReason === "custom-date"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCancellationReason(
                          e.target.value as
                            | "non-payment"
                            | "customer-choice"
                            | "custom-date"
                            | "no-followup"
                        )
                      }
                      className="mr-2 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">
                        Custom Win-Back Date{" "}
                        <span className="text-gray-500">
                          (Follow up on specific date)
                        </span>
                      </span>
                      {cancellationReason === "custom-date" && (
                        <input
                          type="date"
                          value={customWinBackDate}
                          onChange={(e) => setCustomWinBackDate(e.target.value)}
                          className="mt-2 border rounded px-3 py-1 text-sm w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Select follow-up date"
                          min={cancellationDate}
                        />
                      )}
                    </div>
                  </label>
                  <label className="flex items-start">
                    <input
                      type="radio"
                      name="reason"
                      value="no-followup"
                      checked={cancellationReason === "no-followup"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCancellationReason(
                          e.target.value as
                            | "non-payment"
                            | "customer-choice"
                            | "custom-date"
                            | "no-followup"
                        )
                      }
                      className="mr-2 mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      Don&apos;t Follow Up{" "}
                      <span className="text-gray-500">
                        (No follow-up needed)
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancellingCustomer(null);
                    setCancellationReason("non-payment");
                    setCustomWinBackDate("");
                    setCancellationDate("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCancellation}
                  disabled={
                    !cancellationDate ||
                    (cancellationReason === "custom-date" && !customWinBackDate)
                  }
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEW: Reinstate Modal */}
        {showReinstateModal && reinstatingCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-4 text-gray-900">
                Reinstate Customer Policy
              </h3>
              <p className="text-gray-700 mb-4">
                Reinstate policy for <strong>{reinstatingCustomer.name}</strong>{" "}
                ({reinstatingCustomer.id})?
              </p>

              {/* Due Date Field */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Due Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={reinstateDueDate}
                  onChange={(e) => setReinstateDueDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select the new payment due date for this policy
                </p>
              </div>

              {/* Payment Type Field */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={reinstatePaymentType}
                  onChange={(e) =>
                    setReinstatePaymentType(e.target.value as PaymentType)
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="regular">Regular Payment</option>
                  <option value="autopay">Autopay</option>
                  <option value="paid-in-full">Paid in Full</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowReinstateModal(false);
                    setReinstatingCustomer(null);
                    setReinstatePaymentType("regular");
                    setReinstateDueDate("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReinstateSubmit}
                  disabled={!reinstateDueDate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Reinstate Policy
                </button>
              </div>
            </div>
          </div>
        )}

        {showSetupModal && setupCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-7xl max-h-[95vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4 text-gray-900">
                Setup Payment Reminder
              </h3>

              {/* Customer Info Header */}
              <div className="mb-6 pb-4 border-b">
                <p className="text-gray-700 font-medium text-lg">
                  {setupCustomer.customer_name}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <div>
                    <p className="text-xs text-gray-500">Policy</p>
                    <p className="text-sm text-gray-700">
                      {setupCustomer.policy_no}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Company</p>
                    <p className="text-sm text-gray-700">
                      {setupCustomer.company_name}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Coverage Period</p>
                    <p className="text-sm text-gray-700">
                      {new Date(
                        setupCustomer.effective_date
                      ).toLocaleDateString()}{" "}
                      -{" "}
                      {new Date(
                        setupCustomer.expiration_date
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Editable Coverage Period */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={setupEffectiveDate}
                      onChange={(e) => setSetupEffectiveDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Expiration Date
                    </label>
                    <input
                      type="date"
                      value={setupExpirationDate}
                      onChange={(e) => setSetupExpirationDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  💡 Adjust dates to recalculate AI suggestions
                </p>

                {setupPaymentType !== "paid-in-full" &&
                  setupDueDate &&
                  setupExpirationDate &&
                  (() => {
                    const dueDate = new Date(setupDueDate);
                    const expDate = new Date(setupExpirationDate);
                    const monthsDiff = Math.max(
                      0,
                      (expDate.getFullYear() - dueDate.getFullYear()) * 12 +
                        (expDate.getMonth() - dueDate.getMonth())
                    );
                    return (
                      <p className="text-sm font-medium text-blue-600 mt-2">
                        📅 {monthsDiff} payment{monthsDiff !== 1 ? "s" : ""}{" "}
                        remaining until expiration
                      </p>
                    );
                  })()}
              </div>

              {/* Two Column Layout - Side by Side 50/50 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT COLUMN: AI Suggestions */}
                <div className="space-y-4 lg:border-r lg:pr-6 max-h-[60vh] overflow-y-auto">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="text-xl">🤖</span>
                    AI Assistant
                  </h4>

                  {loadingAiSuggestion && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-blue-700">
                          Analyzing your past entries for{" "}
                          {setupCustomer?.company_name}...
                        </p>
                      </div>
                    </div>
                  )}

                  {aiSuggestion && showAiSuggestion && !loadingAiSuggestion && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Suggestions
                            <span
                              className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                aiSuggestion.confidence === "high"
                                  ? "bg-green-100 text-green-700"
                                  : aiSuggestion.confidence === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {aiSuggestion.confidence} confidence
                            </span>
                          </h4>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Based on {aiSuggestion.dataPoints?.sameCompany ?? 0}{" "}
                            past entries
                            {(aiSuggestion.dataPoints?.sameCompany ?? 0) > 0 &&
                              ` for ${setupCustomer?.company_name}`}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowAiSuggestion(false)}
                          className="text-gray-400 hover:text-gray-600 transition"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex items-center justify-between bg-white rounded-lg p-3">
                          <div>
                            <p className="text-xs text-gray-600">
                              Suggested Due Date
                            </p>
                            <p className="font-medium text-gray-900">
                              {parseLocalDate(
                                aiSuggestion.suggestedDueDate
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setSetupDueDate(aiSuggestion.suggestedDueDate)
                            }
                            className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
                          >
                            Apply
                          </button>
                        </div>

                        <div className="flex items-center justify-between bg-white rounded-lg p-3">
                          <div>
                            <p className="text-xs text-gray-600">
                              Suggested Payment
                            </p>
                            <p className="font-medium text-gray-900 capitalize">
                              {aiSuggestion.suggestedPaymentType}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setSetupPaymentType(
                                aiSuggestion.suggestedPaymentType
                              )
                            }
                            className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-white rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-700 mb-1">
                            💡 Reasoning
                          </p>
                          <p className="text-xs text-gray-600">
                            {aiSuggestion.reasoning}
                          </p>
                        </div>

                        {aiSuggestion.companyPattern && (
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">
                              📊 Pattern
                            </p>
                            <p className="text-xs text-gray-600">
                              {aiSuggestion.companyPattern}
                            </p>
                          </div>
                        )}

                        {aiSuggestion.pricingAdvantage && (
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">
                              💰 Pricing Tip
                            </p>
                            <p className="text-xs text-gray-600">
                              {aiSuggestion.pricingAdvantage}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!loadingAiSuggestion && !aiSuggestion && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600">
                        AI suggestions will appear here after analyzing your
                        past entries
                      </p>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: Form Fields */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Setup Details</h4>

                  {setupPaymentType !== "paid-in-full" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Next Payment Due Date *
                      </label>
                      <input
                        type="date"
                        value={setupDueDate}
                        onChange={(e) => setSetupDueDate(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                        min={setupEffectiveDate}
                        max={setupExpirationDate}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        When is the next payment due?
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Type
                    </label>
                    <select
                      value={setupPaymentType}
                      onChange={(e) =>
                        setSetupPaymentType(e.target.value as PaymentType)
                      }
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="regular">Regular Payments</option>
                      <option value="autopay">Autopay</option>
                      <option value="paid-in-full">Paid in Full</option>
                    </select>
                  </div>

                  {setupPaymentType === "paid-in-full" && (
                    <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
                      ℹ️ No due date needed - renewal reminder will be set 20
                      days before expiration
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setShowSetupModal(false);
                        setSetupCustomer(null);
                        setSetupDueDate("");
                        setSetupPaymentType("regular");
                        setAiSuggestion(null);
                        setShowAiSuggestion(true);
                        setSetupEffectiveDate("");
                        setSetupExpirationDate("");
                      }}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmSetup}
                      disabled={
                        setupPaymentType !== "paid-in-full" && !setupDueDate
                      }
                      className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Setup Reminder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200",
    red: "bg-red-50 border-red-200",
    green: "bg-green-50 border-green-200",
    purple: "bg-purple-50 border-purple-200",
  };

  return (
    <div className={`${colorClasses[color]} border rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}

interface FollowUpCardProps {
  customer: Customer;
  followUp: FollowUp;
  onComplete: () => void;
  onMarkPaid: () => void;
  onChangeToDirectBill?: (customerId: string) => void;
  isUpcoming?: boolean;
}

function FollowUpCard({
  customer,
  followUp,
  onComplete,
  onMarkPaid,
  onChangeToDirectBill,
  isUpcoming = false,
}: FollowUpCardProps) {
  const getMethodIcon = (method: string | undefined): JSX.Element => {
    switch (method) {
      case "phone":
        return <Phone className="w-4 h-4" />;
      case "email":
        return <Mail className="w-4 h-4" />;
      case "sms":
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case "final":
        return "bg-red-100 text-red-800 border-red-200";
      case "overdue":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "due-date":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "win-back":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${getTypeColor(
                followUp.type
              )}`}
            >
              {followUp.type.toUpperCase()}
            </span>
            <span className="flex items-center gap-1 text-sm text-gray-600">
              {getMethodIcon(followUp.method)}
              {followUp.method}
            </span>
            {isUpcoming && (
              <span className="text-xs text-gray-500">
                {formatDate(followUp.date, "MMM dd")}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
          <p className="text-sm text-gray-600">Policy: {customer.id}</p>
          <p className="text-sm text-gray-700 mt-1">{followUp.description}</p>
          <p className="text-xs text-gray-500 mt-1">
            Payment {customer.totalPayments - customer.remainingPayments + 1} of{" "}
            {customer.totalPayments}
          </p>
        </div>
        <div className="flex flex-col gap-2 mt-2">
          {customer.paymentType === "autopay" &&
            (followUp.type === "due-date" || followUp.type === "overdue") &&
            onChangeToDirectBill && (
              <button
                onClick={() => onChangeToDirectBill(customer.id)}
                className="w-full px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 transition font-medium"
                title="Autopay declined - switch to direct bill"
              >
                Change to Direct Bill
              </button>
            )}
          {!isUpcoming && (
            <div className="flex gap-2">
              <button
                onClick={onMarkPaid}
                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition font-medium"
              >
                Mark Paid
              </button>
              <button
                onClick={onComplete}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition font-medium"
              >
                Complete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CustomerCardProps {
  customer: Customer;
  onEditDueDate: (id: string) => void;
  onCancelCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customer: Customer) => void;
  onChangeToAutopay: (customerId: string) => void;
  onChangeToDirectBill: (customerId: string) => void;
  onReinstate?: (customer: Customer) => void; // NEW: Optional reinstate prop
  isEditing: boolean;
  editDueDate: string;
  setEditDueDate: (date: string) => void;
  onSaveDueDate: () => void;
  onCancelEdit: () => void;
  // ✅ ADD THESE NEW PROPS
  isEditingDates: boolean;
  editCustomerEffective: string;
  editCustomerExpiration: string;
  onEditCustomerDates: (customer: Customer) => void;
  onCustomerEffectiveDateChange: (date: string, customer: Customer) => void;
  onSaveCustomerDates: (id: string) => void;
  onCancelCustomerEdit: () => void;
  setEditCustomerExpiration: (date: string) => void;
}

function CustomerCard({
  customer,
  onEditDueDate,
  onCancelCustomer,
  onDeleteCustomer,
  onChangeToAutopay,
  onChangeToDirectBill,
  onReinstate, // NEW
  isEditing,
  editDueDate,
  setEditDueDate,
  onSaveDueDate,
  onCancelEdit,
  // ✅ ADD THESE NEW PROPS
  isEditingDates,
  editCustomerEffective,
  editCustomerExpiration,
  onEditCustomerDates,
  onCustomerEffectiveDateChange,
  onSaveCustomerDates,
  onCancelCustomerEdit,
  setEditCustomerExpiration,
}: CustomerCardProps) {
  const completedFollowUps = customer.followUps.filter(
    (f) => f.status === "completed"
  ).length;
  const totalFollowUps = customer.followUps.length;

  // Remove this line - it's now a prop
  // const isEditingDates = editingCustomerDates === customer.id;

  // Calculate policy duration for auto-fill
  let policyDuration = "";
  if (customer.effectiveDate && customer.expirationDate) {
    const effectiveDate = new Date(customer.effectiveDate);
    const expirationDate = new Date(customer.expirationDate);

    const yearDiff = expirationDate.getFullYear() - effectiveDate.getFullYear();
    const monthDiff = expirationDate.getMonth() - effectiveDate.getMonth();
    const dayDiff = expirationDate.getDate() - effectiveDate.getDate();

    let diffMonths = yearDiff * 12 + monthDiff;
    if (dayDiff < 0) {
      diffMonths -= 1;
    }

    policyDuration = diffMonths >= 12 ? "12 months" : `${diffMonths} months`;
  }

  const getStatusBadge = (): JSX.Element => {
    switch (customer.status) {
      case "overdue":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
            Overdue
          </span>
        );
      case "paid":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
            Paid
          </span>
        );
      case "cancelled":
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
            Active
          </span>
        );
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
          <p className="text-sm text-gray-600">Policy: {customer.id}</p>

          {customer.companyName && (
            <p className="text-xs text-gray-600">
              Company: {customer.companyName}
            </p>
          )}
          {customer.coverageType && (
            <p className="text-xs text-gray-600">
              Coverage: {customer.coverageType}
            </p>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={onSaveDueDate}
                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Due: {formatDate(customer.dueDate, "MMM dd, yyyy")}
              </p>

              {/* Policy Dates with Edit Functionality */}
              {customer.effectiveDate && customer.expirationDate && (
                <>
                  {isEditingDates ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 w-20">
                          Effective:
                        </label>
                        <input
                          type="date"
                          value={editCustomerEffective}
                          onChange={
                            (e) =>
                              onCustomerEffectiveDateChange(
                                e.target.value,
                                customer
                              ) // ✅ Changed
                          }
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 w-20">
                          Expiration:
                        </label>
                        <input
                          type="date"
                          value={editCustomerExpiration}
                          onChange={(e) =>
                            setEditCustomerExpiration(e.target.value)
                          }
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-xs text-gray-500 italic">
                          (Auto-filled based on {policyDuration} policy)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSaveCustomerDates(customer.id)} // ✅ Changed
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                        >
                          Save
                        </button>
                        <button
                          onClick={onCancelCustomerEdit} // ✅ Changed
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">
                        Policy:{" "}
                        {formatDate(customer.effectiveDate, "MMM dd, yyyy")} -{" "}
                        {formatDate(customer.expirationDate, "MMM dd, yyyy")}
                      </p>
                      <button
                        onClick={() => onEditCustomerDates(customer)} // ✅ Changed
                        className="p-1 hover:bg-blue-100 rounded"
                        title="Edit Policy Dates"
                      >
                        <Edit className="w-3 h-3 text-blue-600" />
                      </button>
                    </div>
                  )}
                </>
              )}

              {customer.status !== "cancelled" && (
                <p className="text-xs text-gray-500 mt-1">
                  Payment{" "}
                  {customer.totalPayments - customer.remainingPayments + 1} of{" "}
                  {customer.totalPayments} • Due on {customer.paymentDayOfMonth}
                  th of month
                </p>
              )}
              {customer.status === "cancelled" && customer.cancellationDate && (
                <p className="text-xs text-red-600 mt-1">
                  Cancelled:{" "}
                  {formatDate(customer.cancellationDate, "MMM dd, yyyy")} •
                  Reason:{" "}
                  {customer.cancellationReason === "non-payment"
                    ? "Non-Payment"
                    : customer.cancellationReason === "customer-choice"
                    ? "Customer Choice"
                    : customer.cancellationReason === "custom-date"
                    ? "Custom Date"
                    : "No Follow-up"}
                  {customer.winBackDate &&
                    ` • Win-back: ${formatDate(
                      customer.winBackDate,
                      "MMM dd, yyyy"
                    )}`}
                </p>
              )}
            </>
          )}
        </div>
        <div className="text-right flex flex-col gap-2">
          {getStatusBadge()}
          <p className="text-xs text-gray-500 capitalize">
            {customer.paymentType}
          </p>
          {/* NEW: Show reinstate button ONLY for cancelled policies */}
          {customer.status === "cancelled" && onReinstate && (
            <div className="flex gap-1">
              <button
                onClick={() => onReinstate(customer)}
                className="p-1 hover:bg-green-100 rounded"
                title="Reinstate Policy"
              >
                <RotateCcw className="w-4 h-4 text-green-600" />
              </button>
              <button
                onClick={() => onDeleteCustomer(customer)}
                className="p-1 hover:bg-red-100 rounded"
                title="Delete Customer"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          )}

          {/* Existing action buttons for active customers */}
          {customer.status !== "cancelled" && !isEditing && !isEditingDates && (
            <div className="flex gap-1">
              <button
                onClick={() => onEditDueDate(customer.id)}
                className="p-1 hover:bg-blue-100 rounded"
                title="Edit Due Date"
              >
                <Edit className="w-4 h-4 text-blue-600" />
              </button>

              {customer.paymentType === "regular" && (
                <button
                  onClick={() => onChangeToAutopay(customer.id)}
                  className="p-1 hover:bg-green-100 rounded"
                  title="Set Autopay"
                >
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </button>
              )}

              {customer.paymentType === "autopay" && (
                <button
                  onClick={() => onChangeToDirectBill(customer.id)}
                  className="p-1 hover:bg-orange-100 rounded"
                  title="Remove Autopay (Change to Direct Bill)"
                >
                  <Ban className="w-4 h-4 text-orange-600" />
                </button>
              )}

              <button
                onClick={() => onCancelCustomer(customer)}
                className="p-1 hover:bg-red-100 rounded"
                title="Cancel Policy"
              >
                <XCircle className="w-4 h-4 text-red-600" />
              </button>
              <button
                onClick={() => onDeleteCustomer(customer)}
                className="p-1 hover:bg-red-100 rounded"
                title="Delete Customer"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          )}
        </div>
      </div>

      {customer.status !== "cancelled" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Follow-up Progress</span>
            <span>
              {completedFollowUps}/{totalFollowUps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${(completedFollowUps / totalFollowUps) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface WeekCalendarViewProps {
  customers: Customer[];
  onCompleteFollowUp: (customerId: string, followUpIndex: number) => void;
}

function WeekCalendarView({
  customers,
  onCompleteFollowUp,
}: WeekCalendarViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const getWeekDays = (date: Date): Date[] => {
    const days: Date[] = [];
    const current = new Date(date);
    current.setDate(current.getDate() - current.getDay());

    for (let i = 0; i < 7; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const daysInWeek = getWeekDays(currentWeek);

  const getWeekLabel = (): string => {
    const firstDay = daysInWeek[0];
    const lastDay = daysInWeek[6];

    const firstMonth = firstDay.toLocaleString("default", { month: "long" });
    const lastMonth = lastDay.toLocaleString("default", { month: "long" });
    const firstYear = firstDay.getFullYear();
    const lastYear = lastDay.getFullYear();

    // Same month and year
    if (firstMonth === lastMonth && firstYear === lastYear) {
      return `${firstMonth} ${firstYear}`;
    }
    // Same year, different months
    else if (firstYear === lastYear) {
      return `${firstMonth} - ${lastMonth} ${firstYear}`;
    }
    // Different years
    else {
      return `${firstMonth} ${firstYear} - ${lastMonth} ${lastYear}`;
    }
  };

  const getFollowUpsForDay = (
    day: Date
  ): Array<{
    customer: Customer;
    followUp: FollowUp;
    index: number;
  }> => {
    const followUps: Array<{
      customer: Customer;
      followUp: FollowUp;
      index: number;
    }> = [];
    customers.forEach((customer) => {
      customer.followUps.forEach((followUp, index) => {
        if (isSameDay(followUp.date, day)) {
          followUps.push({ customer, followUp, index });
        }
      });
    });
    return followUps;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Weekly Calendar
          </h2>
          <p className="text-sm text-gray-600 mt-1">{getWeekLabel()}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={() => setCurrentWeek(new Date())}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {daysInWeek.map((day, idx) => {
          const followUps = getFollowUpsForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={idx}
              className={`border rounded-lg p-3 min-h-[200px] ${
                isToday ? "bg-blue-50 border-blue-300" : "bg-white"
              }`}
            >
              <div className="font-semibold text-sm mb-2 text-gray-900">
                {formatDate(day, "EEE")}
                <div className="text-lg">{formatDate(day, "d")}</div>
              </div>
              <div className="space-y-2">
                {followUps.map(({ customer, followUp, index }) => (
                  <div
                    key={`${customer.id}-${index}`}
                    className={`rounded p-2 text-xs border ${
                      followUp.status === "completed"
                        ? "bg-green-50 border-green-300"
                        : "bg-blue-100 border-blue-300"
                    }`}
                  >
                    <p className="font-medium text-gray-900">{customer.name}</p>
                    <p className="text-gray-700">{followUp.description}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {followUp.method === "phone" && (
                        <Phone className="w-3 h-3" />
                      )}
                      {followUp.method === "email" && (
                        <Mail className="w-3 h-3" />
                      )}
                      {followUp.method === "sms" && (
                        <MessageSquare className="w-3 h-3" />
                      )}
                      {followUp.status === "completed" ? (
                        <CheckCircle className="w-3 h-3 text-green-600 ml-auto" />
                      ) : (
                        <button
                          onClick={() => onCompleteFollowUp(customer.id, index)}
                          className="ml-auto px-1 py-0.5 bg-blue-600 text-white rounded text-[10px] hover:bg-blue-700"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
