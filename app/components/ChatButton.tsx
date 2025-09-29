import { useState, useEffect, useRef } from "react";
import { MessageCircle, Phone, Globe } from "lucide-react";
import { useRouter } from "next/navigation";

interface Message {
  role: string;
  content: string;
  extra?: {
    quoteType?: string;
    quoteTypes?: string[];
    showDocuments?: boolean;
    showPhoneVerification?: boolean;
    verificationSent?: boolean;
    verificationType?: "claim" | "payment";
    showServiceButtons?: {
      type: "claim" | "payment";
      companies: Array<{
        name: string;
        policyNo: string;
        claimPhone?: string;
        claimLink?: string;
        paymentLink?: string;
      }>;
    };
  } | null;
}

interface CustomerData {
  name: string;
  company_name: string;
  policy_number: string;
  coverage_type: string;
  status: string;
  requestedService?: "claim" | "payment";
}

interface CompanyDatabase {
  [key: string]: {
    name: string;
    claimPhone?: string;
    claimLink?: string;
    paymentLink?: string;
  };
}

// Function to compute string similarity based on common words (case-insensitive)
function getStringSimilarity(str1: string, str2: string): number {
  // Special handling for common abbreviations and variations
  const normalizeCompanyName = (s: string) => {
    return s
      .toLowerCase()
      .replace(/\s+/g, " ") // normalize spaces
      .replace(/[-_]/g, " ") // treat hyphens and underscores as spaces
      .replace(/\bauto\b/g, "auto")
      .replace(/\bautomobile\b/g, "auto")
      .replace(/\binsurance\b/g, "")
      .replace(/\bcompany\b/g, "")
      .replace(/\bagency\b/g, "")
      .replace(/\bgeneral\b/g, "")
      .replace(/\bsouthern\b/g, "")
      .trim();
  };

  const norm1 = normalizeCompanyName(str1);
  const norm2 = normalizeCompanyName(str2);

  // If normalized versions match exactly, return perfect score
  if (norm1 === norm2) return 1;

  // Check if one contains the other (for abbreviations)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

  // Original word-based comparison
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .sort();
  const words1 = normalize(str1);
  const words2 = normalize(str2);

  const commonWords = words1.filter((word) => words2.includes(word));
  const totalUniqueWords = new Set([...words1, ...words2]).size;

  if (totalUniqueWords === 0) return 0;
  return commonWords.length / totalUniqueWords;
}

export default function ChatButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Phone verification states
  const [phoneInput, setPhoneInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [isVerified, setIsVerified] = useState(false); // Track verification status

  // Verification codes storage (in memory)
  const [storedVerificationCode, setStoredVerificationCode] = useState("");
  const [codeExpiration, setCodeExpiration] = useState<Date | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxInputLength = 200;

  // Company database
  const [companyDatabase, setCompanyDatabase] = useState<CompanyDatabase>({});
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  // Load company database from Excel via API
  useEffect(() => {
    setIsDatabaseLoading(true);
    setDatabaseError(null);

    fetch("/api/company-database")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!data.companies) {
          throw new Error("Invalid company database format");
        }
        setCompanyDatabase(data.companies);
        console.log(
          `Loaded ${Object.keys(data.companies).length} companies from Excel`
        );
        console.log(
          "Sample companies:",
          Object.keys(data.companies).slice(0, 5)
        );
        setIsDatabaseLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load companies from Excel:", err);
        setCompanyDatabase({});
        setDatabaseError(
          "Failed to load company database. Please try again later."
        );
        setIsDatabaseLoading(false);
      });
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Auto-focus input after messages update
  useEffect(() => {
    if (open && !loading && !showConfirmClose) {
      inputRef.current?.focus();
    }
  }, [messages, loading, open, showConfirmClose]);

  // Clean phone number function
  const cleanPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  };

  // Check if customer exists using your API
  const checkCustomerExists = async (
    phone: string
  ): Promise<{
    found: boolean;
    customer?: CustomerData;
  }> => {
    const cleanPhone = cleanPhoneNumber(phone);

    try {
      const response = await fetch(
        `https://astraldbapi.herokuapp.com/customer-lookup/${cleanPhone}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { found: false };
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.Data) {
        return {
          found: true,
          customer: {
            name: data.Data.customer_name,
            company_name: data.Data.company_name,
            policy_number: data.Data.policy_no,
            coverage_type: data.Data.coverage_type,
            status: data.Data.status,
          },
        };
      } else if (data.detail === "Customer not found") {
        return { found: false };
      }

      throw new Error("Unexpected response format");
    } catch (error: unknown) {
      console.error("Customer lookup error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Unable to verify customer information: ${errorMessage}`);
    }
  };

  // Send verification code
  const sendVerificationCode = async (
    phone: string,
    serviceType?: "claim" | "payment"
  ) => {
    setVerificationLoading(true);

    try {
      // Validate phone number format
      const cleanPhone = cleanPhoneNumber(phone);
      if (cleanPhone.length !== 10) {
        throw new Error("Please enter a valid 10-digit phone number");
      }

      const customerCheck = await checkCustomerExists(phone);

      if (!customerCheck.found || !customerCheck.customer) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "No active policies found for this phone number. Please verify your number or contact us at (469) 729-5185.",
            extra: null,
          },
        ]);
        setVerificationLoading(false);
        return;
      }

      // Customer is defined here, so we can safely use it
      const customer = customerCheck.customer;
      setCustomerData({
        name: customer.name || "Unknown",
        company_name: customer.company_name || "Unknown",
        policy_number: customer.policy_number || "Unknown",
        coverage_type: customer.coverage_type || "Unknown",
        status: customer.status || "Unknown",
        requestedService: serviceType || "payment",
      });

      const phoneDigits = cleanPhoneNumber(phone);
      const verificationCode = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      const message = `Your verification code is: ${verificationCode} - Texas Premium Insurance Services`;
      const encodedMessage = encodeURIComponent(message);
      const toNumber = `+1${phoneDigits}`;
      const smsUrl = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;

      const response = await fetch(smsUrl);

      if (response.ok) {
        setStoredVerificationCode(verificationCode);
        setCodeExpiration(new Date(Date.now() + 5 * 60 * 1000)); // 5 minutes
        setVerificationSent(true);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Verification code sent to ${phone}! Please enter the 6-digit code to continue. The code will expire in 5 minutes.`,
            extra: { verificationSent: true },
          },
        ]);
      } else {
        throw new Error("Failed to send SMS");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${errorMessage}. Please try again or call us at (469) 729-5185.`,
          extra: null,
        },
      ]);
    } finally {
      setVerificationLoading(false);
    }
  };

  // Verify code and show service buttons
  const verifyCodeAndShowServices = async (code: string) => {
    setVerificationLoading(true);

    try {
      // Check if database is loaded
      if (isDatabaseLoading) {
        throw new Error(
          "Company database is still loading. Please wait a moment and try again."
        );
      }
      if (databaseError) {
        throw new Error(databaseError);
      }

      // Check code expiration
      if (!codeExpiration || new Date() > codeExpiration) {
        throw new Error("Verification code expired. Please request a new one.");
      }

      // Verify code
      if (code !== storedVerificationCode) {
        throw new Error("Invalid verification code. Please try again.");
      }

      if (customerData) {
        console.log("Customer company name:", customerData.company_name);
        console.log(
          "Available companies:",
          Object.keys(companyDatabase).slice(0, 10)
        );

        // Find the best matching company name (case-insensitive)
        let bestMatch = null;
        let highestSimilarity = 0;
        const SIMILARITY_THRESHOLD = 0.3; // Lowered threshold for better matching

        for (const companyName of Object.keys(companyDatabase)) {
          const similarity = getStringSimilarity(
            customerData.company_name,
            companyName
          );
          console.log(
            `Comparing "${
              customerData.company_name
            }" with "${companyName}": Similarity = ${similarity.toFixed(3)}`
          );

          if (
            similarity > highestSimilarity &&
            similarity >= SIMILARITY_THRESHOLD
          ) {
            highestSimilarity = similarity;
            bestMatch = companyName;
          }
        }

        console.log(
          `Best match: "${bestMatch}" with similarity: ${highestSimilarity.toFixed(
            3
          )}`
        );

        const companyInfo = bestMatch
          ? companyDatabase[bestMatch]
          : {
              name: customerData.company_name,
              claimPhone: "Contact your agent",
              claimLink: "Contact your agent",
              paymentLink: "Contact your agent",
            };

        console.log("Selected company info:", companyInfo);

        const customerWithCompanyInfo = {
          name: customerData.company_name,
          policyNo: customerData.policy_number,
          claimPhone: companyInfo.claimPhone,
          claimLink: companyInfo.claimLink,
          paymentLink: companyInfo.paymentLink,
        };

        // Use customerData.requestedService for serviceType
        const serviceType = customerData.requestedService || "payment"; // Fallback to "payment" if undefined

        const matchStatus = bestMatch
          ? `(Match found: ${(highestSimilarity * 100).toFixed(0)}% similarity)`
          : "(No exact match found in database - please contact your agent)";

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✅ Identity verified! Hi ${customerData.name}!\n\nHere are your ${serviceType} options for ${customerData.company_name} ${matchStatus}:`,
            extra: {
              showServiceButtons: {
                type: serviceType,
                companies: [customerWithCompanyInfo],
              },
            },
          },
        ]);

        // Set verification status
        setIsVerified(true);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${errorMessage}`,
          extra: null,
        },
      ]);
    } finally {
      setVerificationLoading(false);
    }
  };

  // AI response logic - simplified and more dynamic
  const getAIResponse = (
    userMessage: string
  ): {
    content: string;
    extra?: Message["extra"];
    shouldDeferToAPI?: boolean;
  } => {
    const lowerMessage = userMessage.toLowerCase().trim();

    // Check for explicit filing/payment intent (not just asking questions)
    const isActuallyFiling =
      lowerMessage.includes("file a claim") ||
      lowerMessage.includes("file claim") ||
      lowerMessage.includes("open a claim") ||
      lowerMessage.includes("start a claim") ||
      lowerMessage.includes("report a claim") ||
      lowerMessage === "file" ||
      lowerMessage === "claim";

    const isActuallyPaying =
      lowerMessage.includes("make a payment") ||
      lowerMessage.includes("make payment") ||
      lowerMessage.includes("payment link") ||
      lowerMessage.includes("pay link") ||
      lowerMessage === "pay" ||
      lowerMessage === "payment";

    // Only trigger verification for actual action intent
    if (isActuallyFiling && !isVerified) {
      return {
        content:
          "I can help you file a claim! To get started, I need to verify your identity for security purposes.",
        extra: {
          showPhoneVerification: true,
          verificationType: "claim",
        },
      };
    }

    if (isActuallyPaying && !isVerified) {
      return {
        content:
          "I can help you make a payment! To get started, I need to verify your identity for security purposes.",
        extra: {
          showPhoneVerification: true,
          verificationType: "payment",
        },
      };
    }

    // Everything else goes to AI
    return {
      content: "",
      extra: null,
      shouldDeferToAPI: true,
    };
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, newMessage]);
    const currentInput = input;
    setInput("");
    setLoading(true);

    try {
      // Check for local handling first
      const aiResponse = getAIResponse(currentInput);

      // If it's a verification trigger, handle locally
      if (aiResponse.extra?.showPhoneVerification) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: aiResponse.content,
            extra: aiResponse.extra,
          },
        ]);
        setLoading(false);
        return;
      }

      // Call OpenAI API for natural response
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, newMessage] }),
      });

      const data = await res.json();
      let reply =
        data.choices?.[0]?.message?.content || "Sorry, something went wrong.";
      let quoteType = data.choices?.[0]?.message?.quoteType || null;
      const quoteTypes = data.choices?.[0]?.message?.quoteTypes || null;
      const showDocuments = data.choices?.[0]?.message?.showDocuments || false;

      console.log("API Response:", {
        showDocuments,
        quoteType,
        quoteTypes,
        reply: reply.substring(0, 50),
      });

      // Clean up any JSON that might have leaked through
      reply = reply.replace(/\{[^}]*quoteType[^}]*\}/g, "").trim();

      // Check if verified user is asking about claims/payments
      const lowerInput = currentInput.toLowerCase();
      const isAskingAboutClaims =
        lowerInput.includes("claim") ||
        lowerInput.includes("file") ||
        lowerInput.includes("report") ||
        lowerInput.includes("accident");

      const isAskingAboutPayments =
        lowerInput.includes("pay") ||
        lowerInput.includes("payment") ||
        lowerInput.includes("bill");

      // If verified and asking about claims/payments, inject buttons
      let extraButtons: Message["extra"] = null;
      if (isVerified && (isAskingAboutClaims || isAskingAboutPayments)) {
        const lastVerifiedMessage = messages
          .slice()
          .reverse()
          .find(
            (msg) =>
              msg.role === "assistant" &&
              msg.extra?.showServiceButtons?.companies?.[0]
          );

        if (lastVerifiedMessage?.extra?.showServiceButtons?.companies?.[0]) {
          const companyInfo =
            lastVerifiedMessage.extra.showServiceButtons.companies[0];
          const serviceType: "claim" | "payment" = isAskingAboutClaims
            ? "claim"
            : "payment";

          extraButtons = {
            showServiceButtons: {
              type: serviceType,
              companies: [companyInfo],
            },
          };
        }
      }

      // Handle quote type detection
      if (!quoteType && reply.includes("{") && reply.includes("quoteType")) {
        try {
          const jsonMatch = reply.match(/\{[^}]*"quoteType"[^}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            quoteType = parsed.quoteType;
            reply = reply.replace(jsonMatch[0], "").trim();
          }
        } catch (e) {
          // Continue without JSON parsing
          console.debug(e);
        }
      }

      reply = reply.replace(/\{[^}]*quoteType[^}]*\}/g, "").trim();

      // Determine final extra data
      let finalExtra: Message["extra"] = null;

      if (extraButtons) {
        // Show claim/payment buttons for verified users
        finalExtra = extraButtons;
      } else if (showDocuments) {
        // Show document button
        finalExtra = { showDocuments: true };
      } else if (quoteTypes && quoteTypes.length > 0) {
        // Show multiple quote buttons
        finalExtra = { quoteTypes: quoteTypes };
      } else if (quoteType) {
        // Show single quote button
        finalExtra = { quoteType: quoteType };
      }

      // Add message with appropriate buttons
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply,
          extra: finalExtra,
        },
      ]);
    } catch (err) {
      console.error("Chat API error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I'm having trouble connecting right now, Try asking the same questions in few seconds. Please call us at (469) 729-5185 or email support@TexasPremiumIns.com for immediate assistance.",
          extra: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseChat = () => {
    setShowConfirmClose(false);
    setOpen(false);
    setMessages([]);
    setPhoneInput("");
    setVerificationCode("");
    setVerificationSent(false);
    setCustomerData(null);
    setStoredVerificationCode("");
    setCodeExpiration(null);
    setIsVerified(false); // Reset verification status
  };

  const router = useRouter();

  const handleQuoteNavigation = (quoteType: string) => {
    setIsNavigating(true);

    const routeMap: { [key: string]: string } = {
      auto: "/auto",
      homeowners: "/homeowners",
      renters: "/renters",
      motorcycle: "/motorcycle",
      boats: "/boats",
      rv: "/rv",
      sr22: "/sr22",
      "mobile-home": "/mobile-home",
      "commercial-auto": "/commercial-auto",
      "general-liability": "/general-liability",
      "mexico-tourist": "/mexico-tourist",
      "surety-bond": "/surety-bond",
      view_documents: "/view_documents",
    };

    const targetRoute = routeMap[quoteType] || "/";

    setTimeout(() => {
      setOpen(false);
      setIsNavigating(false);
      router.push(targetRoute);
    }, 300);
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-8 right-8 z-50 w-14 h-14 flex items-center justify-center 
               rounded-full shadow-xl
               bg-gradient-to-r from-red-700 to-blue-800  
               text-white hover:scale-110 transition-all duration-300 animate-pulse"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat Box */}
      {open && (
        <div
          className={`fixed bottom-20 right-4 z-50 h-[600px] w-[420px] rounded-2xl shadow-2xl 
                      flex flex-col transition-all duration-300
                      bg-gradient-to-b from-white via-white to-gray-50 border
                      ${
                        isNavigating
                          ? "opacity-50 scale-95"
                          : "opacity-100 scale-100"
                      }`}
        >
          {/* Header */}
          <div
            className="p-3 rounded-t-2xl text-white flex justify-between items-center 
                        bg-gradient-to-r from-red-700 to-blue-800"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                <span className="text-blue-800 text-xs font-bold">TP</span>
              </div>
              <span className="font-semibold tracking-wide">
                Samantha – Virtual Assistant
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(false)}
                className="hover:text-gray-200 transition text-lg font-bold"
              >
                –
              </button>
              <button
                onClick={() => setShowConfirmClose(true)}
                className="hover:text-gray-200 transition text-lg"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex gap-2 p-3 bg-gray-100 border-b">
            <a
              href="tel:4697295185"
              className="flex-1 text-center px-3 py-2 rounded-lg text-white 
                         bg-green-600 text-sm font-medium hover:opacity-90 transition"
            >
              Call
            </a>
            <a
              href="mailto:support@TexasPremiumIns.com"
              className="flex-1 text-center px-3 py-2 rounded-lg text-white 
                         bg-blue-600 text-sm font-medium hover:opacity-90 transition"
            >
              Email
            </a>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center mt-10 space-y-4">
                <div className="text-4xl">👋</div>
                <p className="font-medium text-gray-700">
                  Welcome to Texas Premium Insurance!
                </p>
                <div className="bg-blue-50 p-3 rounded-lg text-left">
                  <p className="font-medium text-blue-800 mb-2">
                    I can help you with:
                  </p>
                  <ul className="text-blue-700 text-sm space-y-1.5">
                    <li>• Ask any insurance questions</li>
                    <li>• Request a quote</li>
                    <li>• Get your payment link and claim info</li>
                    <li>• Request documents</li>
                    <li>• Talk to a live agent (coming soon)</li>
                  </ul>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx}>
                  <div
                    className={`p-3 rounded-xl shadow-sm max-w-[75%] transition-all duration-300 ${
                      msg.role === "user"
                        ? "ml-auto bg-gradient-to-r from-red-50 to-blue-50 text-gray-800 border border-red-100"
                        : "mr-auto bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.content}</div>

                    {/* Single Quote Button */}
                    {msg.role === "assistant" &&
                      msg.extra?.quoteType &&
                      !msg.extra?.quoteTypes && (
                        <button
                          onClick={() =>
                            handleQuoteNavigation(msg.extra!.quoteType!)
                          }
                          className="mt-3 inline-block px-4 py-2 rounded-lg text-white 
                                   bg-gradient-to-r from-red-700 to-blue-800 
                                   text-sm font-medium hover:opacity-90 transition-all duration-200
                                   hover:scale-105 shadow-md"
                        >
                          Get a {msg.extra!.quoteType} Quote →
                        </button>
                      )}

                    {/* Multiple Quote Buttons */}
                    {msg.role === "assistant" &&
                      msg.extra?.quoteTypes &&
                      msg.extra.quoteTypes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.extra.quoteTypes.map((type, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleQuoteNavigation(type)}
                              className="px-4 py-2 rounded-lg text-white 
                                     bg-gradient-to-r from-red-700 to-blue-800 
                                     text-sm font-medium hover:opacity-90 transition-all duration-200
                                     hover:scale-105 shadow-md"
                            >
                              Get {type} Quote →
                            </button>
                          ))}
                        </div>
                      )}

                    {/* View Documents Button */}
                    {msg.role === "assistant" && msg.extra?.showDocuments && (
                      <button
                        onClick={() => handleQuoteNavigation("view_documents")}
                        className="mt-3 inline-block px-4 py-2 rounded-lg text-white 
                                   bg-gradient-to-r from-purple-600 to-indigo-700 
                                   text-sm font-medium hover:opacity-90 transition-all duration-200
                                   hover:scale-105 shadow-md"
                      >
                        📄 View Documents →
                      </button>
                    )}

                    {/* Phone Verification UI */}
                    {msg.role === "assistant" &&
                      msg.extra?.showPhoneVerification &&
                      !isVerified && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm font-medium text-blue-800 mb-2">
                            Enter your phone number:
                          </p>
                          <div className="space-y-2">
                            <input
                              type="tel"
                              value={phoneInput}
                              onChange={(e) => setPhoneInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  phoneInput.trim() &&
                                  !verificationLoading
                                ) {
                                  const serviceType =
                                    msg.extra?.verificationType ||
                                    (msg.content.toLowerCase().includes("claim")
                                      ? "claim"
                                      : "payment");
                                  sendVerificationCode(phoneInput, serviceType);
                                }
                              }}
                              placeholder="(555) 123-4567"
                              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              maxLength={14}
                            />
                            <button
                              onClick={() => {
                                // Determine service type from the message context
                                const serviceType =
                                  msg.extra?.verificationType ||
                                  (msg.content.toLowerCase().includes("claim")
                                    ? "claim"
                                    : "payment");
                                sendVerificationCode(phoneInput, serviceType);
                              }}
                              disabled={
                                verificationLoading || !phoneInput.trim()
                              }
                              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium 
                                     hover:bg-blue-700 transition disabled:opacity-50"
                            >
                              {verificationLoading
                                ? "Sending..."
                                : "Send Verification Code"}
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Verification Code Input */}
                    {msg.role === "assistant" &&
                      msg.extra?.verificationSent &&
                      !isVerified && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm font-medium text-green-800 mb-2">
                            Enter verification code:
                          </p>
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={verificationCode}
                              onChange={(e) =>
                                setVerificationCode(
                                  e.target.value.replace(/\D/g, "").slice(0, 6)
                                )
                              }
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  verificationCode.length === 6 &&
                                  !verificationLoading
                                ) {
                                  verifyCodeAndShowServices(verificationCode);
                                }
                              }}
                              placeholder="123456"
                              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                              maxLength={6}
                            />
                            <button
                              onClick={() =>
                                verifyCodeAndShowServices(verificationCode)
                              }
                              disabled={
                                verificationLoading ||
                                verificationCode.length !== 6
                              }
                              className="w-full px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium 
                                     hover:bg-green-700 transition disabled:opacity-50"
                            >
                              {verificationLoading
                                ? "Verifying..."
                                : "Verify Code"}
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Verified Status */}
                    {msg.role === "assistant" &&
                      isVerified &&
                      msg.extra?.showServiceButtons && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm font-medium text-green-800 mb-2">
                            ✓ Phone number verified
                          </p>
                          <button
                            disabled
                            className="w-full px-3 py-2 bg-gray-300 text-gray-600 rounded-lg text-sm font-medium 
                                     cursor-not-allowed"
                          >
                            Verified
                          </button>
                        </div>
                      )}

                    {/* Service Buttons (Claims/Payment) */}
                    {msg.role === "assistant" &&
                      msg.extra?.showServiceButtons && (
                        <div className="mt-3 space-y-3">
                          {msg.extra.showServiceButtons.companies.map(
                            (company, companyIdx) => (
                              <div
                                key={companyIdx}
                                className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                              >
                                <div className="font-medium text-gray-800 mb-2 text-sm">
                                  {company.name} - Policy #{company.policyNo}
                                </div>

                                <div className="flex gap-2">
                                  {msg.extra!.showServiceButtons!.type ===
                                  "claim" ? (
                                    <>
                                      <a
                                        href={`tel:${
                                          company.claimPhone?.replace(
                                            /\D/g,
                                            ""
                                          ) || ""
                                        }`}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 
                                             bg-green-600 text-white rounded-lg text-sm font-medium 
                                             hover:bg-green-700 transition"
                                      >
                                        <Phone className="w-4 h-4" />
                                        Call Claims
                                      </a>

                                      <a
                                        href={company.claimLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 
                                             bg-blue-600 text-white rounded-lg text-sm font-medium 
                                             hover:bg-blue-700 transition"
                                      >
                                        <Globe className="w-4 h-4" />
                                        Website
                                      </a>
                                    </>
                                  ) : (
                                    <a
                                      href={company.paymentLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 
                                           bg-purple-600 text-white rounded-lg text-sm font-medium 
                                           hover:bg-purple-700 transition"
                                    >
                                      <Globe className="w-4 h-4" />
                                      Make Payment
                                    </a>
                                  )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="mr-auto bg-gray-100 p-3 rounded-xl max-w-[75%] border border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                  <span className="text-gray-500">Samantha is typing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Confirm Close Modal */}
          {showConfirmClose && (
            <div className="fixed inset-0 backdrop-blur-[1px] flex items-center justify-center z-[60]">
              <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
                <div className="text-center">
                  <div className="text-4xl mb-4">❓</div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Close Chat?
                  </h3>
                  <p className="text-gray-600 mb-6 text-sm">
                    Are you sure you want to close this chat? This will clear
                    the entire conversation.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmClose(false)}
                      className="flex-1 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCloseChat}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition font-medium"
                    >
                      Close Chat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          {!showConfirmClose && (
            <div className="p-3 border-t flex items-center gap-2 bg-gray-50 rounded-b-2xl">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  if (e.target.value.length <= maxInputLength) {
                    setInput(e.target.value);
                  }
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && !loading && sendMessage()
                }
                placeholder="Ask about coverage, claims, or payments..."
                className="flex-1 px-3 py-2 text-sm rounded-xl border 
                          focus:outline-none focus:ring-2 focus:ring-red-500/30
                          disabled:opacity-50"
                maxLength={maxInputLength}
                disabled={loading}
              />
              <div className="text-xs text-gray-400 min-w-[40px] text-right">
                {input.length}/{maxInputLength}
              </div>
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-4 py-2 rounded-xl shadow 
                          bg-gradient-to-r from-red-700 to-blue-800 
                          text-white font-medium hover:opacity-90 transition
                          disabled:opacity-50 disabled:cursor-not-allowed
                          hover:scale-105"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
