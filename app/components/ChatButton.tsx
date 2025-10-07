import { useState, useEffect, useRef } from "react";
import {
  MessageCircle,
  Phone,
  Globe,
  X,
  Minus,
  Paperclip,
  Smile,
} from "lucide-react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";
import EmojiPicker from "emoji-picker-react";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "https://texaspremium-production.up.railway.app";

interface Message {
  role: string;
  content: string;
  userName?: string;
  extra?: {
    quoteType?: string;
    quoteTypes?: string[];
    showDocuments?: boolean;
    showPhoneVerification?: boolean;
    verificationSent?: boolean;
    verificationType?: "claim" | "payment";
    requestLiveAgent?: boolean;
    liveAgentFormSubmitted?: boolean;
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
  fileUrl?: string;
  fileName?: string;
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

function getStringSimilarity(str1: string, str2: string): number {
  const normalizeCompanyName = (s: string) => {
    return s
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[-_]/g, " ")
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

  if (norm1 === norm2) return 1;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

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

  const [phoneInput, setPhoneInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [storedVerificationCode, setStoredVerificationCode] = useState("");
  const [codeExpiration, setCodeExpiration] = useState<Date | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const maxInputLength = 200;

  const [companyDatabase, setCompanyDatabase] = useState<CompanyDatabase>({});
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const [isLiveChat, setIsLiveChat] = useState(false);
  const [liveAgentName, setLiveAgentName] = useState("");
  const [liveAgentPhone, setLiveAgentPhone] = useState("");
  const [isConnectedToAgent, setIsConnectedToAgent] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      if (window.visualViewport && chatContainerRef.current) {
        const viewport = window.visualViewport;
        const isMobile = window.innerWidth < 640;

        if (isMobile) {
          requestAnimationFrame(() => {
            if (chatContainerRef.current) {
              chatContainerRef.current.style.height = `${viewport.height}px`;
            }
          });
        }
      }
    };

    const handleFocus = () => {
      setTimeout(() => {
        if (inputRef.current && chatContainerRef.current) {
          const messagesContainer = chatContainerRef.current.querySelector(
            "[data-messages-container]"
          );
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      }, 100);
    };

    handleResize();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
    }

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener("focus", handleFocus);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
        window.visualViewport.removeEventListener("scroll", handleResize);
      }
      if (inputElement) {
        inputElement.removeEventListener("focus", handleFocus);
      }
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingDebounceTimer.current) {
        clearTimeout(typingDebounceTimer.current);
      }
    };
  }, []);

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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
    }
  };

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages]);

  useEffect(() => {
    if (open && !loading && !showConfirmClose) {
      inputRef.current?.focus();
    }
  }, [messages, loading, open, showConfirmClose]);

  const cleanPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  };

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

  const sendVerificationCode = async (
    phone: string,
    serviceType?: "claim" | "payment"
  ) => {
    setVerificationLoading(true);

    try {
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
        setCodeExpiration(new Date(Date.now() + 5 * 60 * 1000));

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

  const verifyCodeAndShowServices = async (code: string) => {
    setVerificationLoading(true);

    try {
      if (isDatabaseLoading) {
        throw new Error(
          "Company database is still loading. Please wait a moment and try again."
        );
      }
      if (databaseError) {
        throw new Error(databaseError);
      }

      if (!codeExpiration || new Date() > codeExpiration) {
        throw new Error("Verification code expired. Please request a new one.");
      }

      if (code !== storedVerificationCode) {
        throw new Error("Invalid verification code. Please try again.");
      }

      if (customerData) {
        let bestMatch = null;
        let highestSimilarity = 0;
        const SIMILARITY_THRESHOLD = 0.3;

        for (const companyName of Object.keys(companyDatabase)) {
          const similarity = getStringSimilarity(
            customerData.company_name,
            companyName
          );

          if (
            similarity > highestSimilarity &&
            similarity >= SIMILARITY_THRESHOLD
          ) {
            highestSimilarity = similarity;
            bestMatch = companyName;
          }
        }

        const companyInfo = bestMatch
          ? companyDatabase[bestMatch]
          : {
              name: customerData.company_name,
              claimPhone: "Contact your agent",
              claimLink: "Contact your agent",
              paymentLink: "Contact your agent",
            };

        const customerWithCompanyInfo = {
          name: customerData.company_name,
          policyNo: customerData.policy_number,
          claimPhone: companyInfo.claimPhone,
          claimLink: companyInfo.claimLink,
          paymentLink: companyInfo.paymentLink,
        };

        const serviceType = customerData.requestedService || "payment";

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

  const connectToLiveChat = (name: string, phone: string) => {
    setLiveAgentName(name);
    setLiveAgentPhone(phone);
    setIsLiveChat(true);

    let userId = localStorage.getItem("chat-user-id");
    if (!userId) {
      userId = `user-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chat-user-id", userId);
    }

    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      console.log("Connected to live chat server");

      socketRef.current?.emit("customer-join", {
        userId,
        userName: name,
        userPhone: phone,
        conversationHistory: messages.map((msg) => ({
          content: msg.content,
          isAdmin: msg.role === "assistant",
          timestamp: new Date().toISOString(),
        })),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connecting you to a live agent... Please wait.",
          extra: { liveAgentFormSubmitted: true },
        },
      ]);
    });

    socketRef.current.on(
      "agent-joined",
      ({ agentName, message }: { agentName: string; message: string }) => {
        setIsConnectedToAgent(true);
        setAgentName(agentName);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: message,
            extra: null,
          },
        ]);
      }
    );

    socketRef.current.on(
      "new-message",
      (message: {
        isAdmin: boolean;
        content: string;
        userName?: string;
        fileUrl?: string;
        fileName?: string;
      }) => {
        setMessages((prev) => [
          ...prev,
          {
            role: message.isAdmin ? "assistant" : "user",
            content: message.content,
            userName: message.userName,
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            extra: null,
          },
        ]);
        setAgentTyping(false);
      }
    );

    socketRef.current.on(
      "agent-typing-indicator",
      ({ isTyping }: { isTyping: boolean }) => {
        setAgentTyping(isTyping);
      }
    );

    socketRef.current.on("agent-left", ({ message }: { message: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
          extra: null,
        },
      ]);
      setIsConnectedToAgent(false);
    });

    socketRef.current.on(
      "session-ended",
      ({ message }: { message: string }) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              message ||
              "The agent has ended the chat session. Thank you for contacting us!",
            extra: null,
          },
        ]);
        setIsLiveChat(false);
        setIsConnectedToAgent(false);
        socketRef.current?.disconnect();
      }
    );

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from live chat server");
    });
  };

  const handleCustomerTyping = (value: string) => {
    setInput(value);

    if (isLiveChat && socketRef.current) {
      const userId = localStorage.getItem("chat-user-id");

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingDebounceTimer.current) {
        clearTimeout(typingDebounceTimer.current);
      }

      typingDebounceTimer.current = setTimeout(() => {
        if (value.length > 0) {
          socketRef.current?.emit("customer-typing", {
            userId,
            isTyping: true,
          });

          typingTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit("customer-typing", {
              userId,
              isTyping: false,
            });
          }, 2000);
        } else {
          socketRef.current?.emit("customer-typing", {
            userId,
            isTyping: false,
          });
        }
      }, 150);
    }
  };

  const getAIResponse = (
    userMessage: string
  ): {
    content: string;
    extra?: Message["extra"];
    shouldDeferToAPI?: boolean;
  } => {
    const lowerMessage = userMessage.toLowerCase().trim();

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
      lowerMessage.includes("pay my bill") ||
      lowerMessage.includes("pay bill") ||
      lowerMessage.includes("pay the bill") ||
      (lowerMessage.includes("pay") && lowerMessage.includes("bill")) ||
      lowerMessage === "pay" ||
      lowerMessage === "payment" ||
      (lowerMessage.includes("can i") && lowerMessage.includes("pay")) ||
      (lowerMessage.includes("i want to") && lowerMessage.includes("pay")) ||
      (lowerMessage.includes("need to") && lowerMessage.includes("pay"));

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

    return {
      content: "",
      extra: null,
      shouldDeferToAPI: true,
    };
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { role: "user", content: input };
    const currentInput = input;
    setInput("");
    setLoading(true);

    if (isLiveChat && socketRef.current) {
      const userId = localStorage.getItem("chat-user-id");
      socketRef.current.emit("customer-typing", {
        userId,
        isTyping: false,
      });
    }

    if (isLiveChat && socketRef.current) {
      const userId = localStorage.getItem("chat-user-id");

      socketRef.current.emit("customer-message", {
        userId,
        userName: liveAgentName,
        content: currentInput,
      });
      setLoading(false);
      return;
    }

    setMessages((prev) => [...prev, newMessage]);

    try {
      const aiResponse = getAIResponse(currentInput);

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

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, newMessage] }),
      });

      const data = await res.json();

      if (data.choices?.[0]?.message?.requestLiveAgent) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.choices[0].message.content,
            extra: { requestLiveAgent: true },
          },
        ]);
        setLoading(false);
        return;
      }

      let reply =
        data.choices?.[0]?.message?.content || "Sorry, something went wrong.";
      let quoteType = data.choices?.[0]?.message?.quoteType || null;
      const quoteTypes = data.choices?.[0]?.message?.quoteTypes || null;
      const showDocuments = data.choices?.[0]?.message?.showDocuments || false;

      reply = reply.replace(/\{[^}]*quoteType[^}]*\}/g, "").trim();

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

      if (!quoteType && reply.includes("{") && reply.includes("quoteType")) {
        try {
          const jsonMatch = reply.match(/\{[^}]*"quoteType"[^}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            quoteType = parsed.quoteType;
            reply = reply.replace(jsonMatch[0], "").trim();
          }
        } catch (e) {
          console.debug(e);
        }
      }

      reply = reply.replace(/\{[^}]*quoteType[^}]*\}/g, "").trim();

      let finalExtra: Message["extra"] = null;

      if (extraButtons) {
        finalExtra = extraButtons;
      } else if (showDocuments) {
        finalExtra = { showDocuments: true };
      } else if (quoteTypes && quoteTypes.length > 0) {
        finalExtra = { quoteTypes: quoteTypes };
      } else if (quoteType) {
        finalExtra = { quoteType: quoteType };
      }

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
            "I'm having trouble connecting right now. Try asking the same questions in a few seconds. Please call us at (469) 729-5185 or email support@TexasPremiumIns.com for immediate assistance.",
          extra: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseChat = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setShowConfirmClose(false);
    setOpen(false);
    setMessages([]);
    setPhoneInput("");
    setVerificationCode("");
    setCustomerData(null);
    setStoredVerificationCode("");
    setCodeExpiration(null);
    setIsVerified(false);
    setIsLiveChat(false);
    setIsConnectedToAgent(false);
    setLiveAgentName("");
    setLiveAgentPhone("");
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/upload-file", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (data.success) {
          if (isLiveChat && socketRef.current) {
            const userId = localStorage.getItem("chat-user-id");
            socketRef.current.emit("customer-message", {
              userId,
              userName: liveAgentName,
              content: `📎 Sent file: ${file.name}`,
              fileUrl: data.fileUrl,
              fileName: file.name,
            });
          }

          setSelectedFile(null);
        }
      } catch (error) {
        console.error("File upload error:", error);
        alert("Failed to upload file. Please try again.");
      }
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50 
                     w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center 
                     rounded-full shadow-xl
                     bg-gradient-to-r from-red-700 to-blue-800  
                     text-white hover:scale-110 transition-all duration-300 animate-pulse"
          aria-label="Open chat"
        >
          <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>
      )}

      {open && (
        <div
          ref={chatContainerRef}
          className={`fixed sm:inset-auto sm:bottom-4 sm:right-4 
                      z-50 
                      sm:h-[600px] sm:w-[420px] sm:max-w-[calc(100vw-2rem)]
                      sm:rounded-2xl shadow-2xl 
                      flex flex-col transition-all duration-300
                      bg-gradient-to-b from-white via-white to-gray-50 
                      sm:border
                      ${
                        isNavigating
                          ? "opacity-50 scale-95"
                          : "opacity-100 scale-100"
                      }`}
          style={{
            top:
              typeof window !== "undefined" && window.innerWidth < 640
                ? "0"
                : undefined,
            left:
              typeof window !== "undefined" && window.innerWidth < 640
                ? "0"
                : undefined,
            right:
              typeof window !== "undefined" && window.innerWidth < 640
                ? "0"
                : undefined,
            bottom:
              typeof window !== "undefined" && window.innerWidth < 640
                ? "0"
                : undefined,
            height:
              typeof window !== "undefined" && window.innerWidth < 640
                ? `${window.visualViewport?.height || window.innerHeight}px`
                : undefined,
          }}
        >
          <div
            className="p-3 sm:p-4 sm:rounded-t-2xl text-white flex justify-between items-center 
                        bg-gradient-to-r from-red-700 to-blue-800 flex-shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-800 text-xs sm:text-sm font-bold">
                  TP
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold tracking-wide text-sm sm:text-base truncate">
                  {isConnectedToAgent
                    ? agentName
                    : "Samantha – Virtual Assistant"}
                </span>
                {isLiveChat && (
                  <span className="text-xs text-blue-100">
                    {isConnectedToAgent
                      ? "● Live Agent"
                      : "○ Waiting for agent..."}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="hover:text-gray-200 transition p-1.5 sm:p-1"
                aria-label="Minimize chat"
              >
                <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <button
                onClick={() => setShowConfirmClose(true)}
                className="hover:text-gray-200 transition p-1.5 sm:p-1"
                aria-label="Close chat"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 p-3 bg-gray-100 border-b flex-shrink-0">
            <a
              href="tel:4697295185"
              className="flex-1 text-center px-3 py-2 rounded-lg text-white 
                         bg-green-600 text-sm font-medium hover:opacity-90 transition active:scale-95"
            >
              Call
            </a>
            <a
              href="mailto:support@TexasPremiumIns.com"
              className="flex-1 text-center px-3 py-2 rounded-lg text-white 
                         bg-blue-600 text-sm font-medium hover:opacity-90 transition active:scale-95"
            >
              Email
            </a>
            {isLiveChat && (
              <button
                onClick={() => {
                  if (socketRef.current) {
                    const userId = localStorage.getItem("chat-user-id");

                    setTimeout(() => {
                      socketRef.current?.emit("customer-end-session", {
                        userId,
                      });
                    }, 50);

                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content:
                          "You have ended the chat session. Thank you for contacting us!",
                        extra: null,
                      },
                    ]);

                    setIsLiveChat(false);
                    setIsConnectedToAgent(false);

                    setTimeout(() => {
                      socketRef.current?.disconnect();
                    }, 500);
                  }
                }}
                className="flex-1 text-center px-3 py-2 rounded-lg text-white 
               bg-red-600 text-sm font-medium hover:opacity-90 transition active:scale-95"
              >
                End Chat
              </button>
            )}
          </div>

          <div
            data-messages-container
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 text-sm min-h-0 overscroll-contain"
            style={{
              scrollBehavior: "smooth",
              overscrollBehavior: "contain",
            }}
          >
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center mt-4 sm:mt-10 space-y-3 sm:space-y-4 px-2">
                <div className="text-4xl sm:text-5xl">👋</div>
                <p className="font-medium text-gray-700 text-base sm:text-lg">
                  Welcome to Texas Premium Insurance!
                </p>
                <div className="bg-blue-50 p-4 rounded-lg text-left">
                  <p className="font-medium text-blue-800 mb-2 text-sm sm:text-base">
                    I can help you with:
                  </p>
                  <ul className="text-blue-700 text-sm space-y-1.5">
                    <li>• Ask any insurance questions</li>
                    <li>• Request a quote</li>
                    <li>• Get your payment link and claim info</li>
                    <li>• Request documents</li>
                    <li>• Talk to a live agent</li>
                  </ul>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx}>
                  <div
                    className={`p-3 rounded-xl shadow-sm max-w-[85%] sm:max-w-[75%] transition-all duration-300 ${
                      msg.role === "user"
                        ? "ml-auto bg-gradient-to-r from-red-50 to-blue-50 text-gray-800 border border-red-100"
                        : "mr-auto bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    <p className="text-xs font-semibold mb-1 text-gray-600">
                      {msg.role === "user"
                        ? liveAgentName || "You"
                        : msg.userName || "Samantha"}
                    </p>

                    <div className="whitespace-pre-line text-sm">
                      {msg.content}
                    </div>

                    {msg.fileUrl && (
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition"
                      >
                        <Paperclip className="w-4 h-4" />
                        {msg.fileName || "Download file"}
                      </a>
                    )}

                    {msg.role === "assistant" &&
                      msg.extra?.quoteType &&
                      !msg.extra?.quoteTypes && (
                        <button
                          onClick={() =>
                            handleQuoteNavigation(msg.extra!.quoteType!)
                          }
                          className="mt-3 w-full sm:w-auto inline-block px-4 py-2.5 rounded-lg text-white 
                     bg-gradient-to-r from-red-700 to-blue-800 
                     text-sm font-medium hover:opacity-90 transition-all duration-200
                     active:scale-95 shadow-md"
                        >
                          Get a {msg.extra!.quoteType} Quote →
                        </button>
                      )}

                    {msg.role === "assistant" &&
                      msg.extra?.quoteTypes &&
                      msg.extra.quoteTypes.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                          {msg.extra.quoteTypes.map((type, typeIdx) => (
                            <button
                              key={typeIdx}
                              onClick={() => handleQuoteNavigation(type)}
                              className="w-full px-4 py-2.5 rounded-lg text-white 
                                     bg-gradient-to-r from-red-700 to-blue-800 
                                     text-sm font-medium hover:opacity-90 transition-all duration-200
                                     active:scale-95 shadow-md"
                            >
                              Get {type} Quote →
                            </button>
                          ))}
                        </div>
                      )}

                    {msg.role === "assistant" && msg.extra?.showDocuments && (
                      <button
                        onClick={() => handleQuoteNavigation("view_documents")}
                        className="mt-3 w-full sm:w-auto inline-block px-4 py-2.5 rounded-lg text-white 
                                   bg-gradient-to-r from-purple-600 to-indigo-700 
                                   text-sm font-medium hover:opacity-90 transition-all duration-200
                                   active:scale-95 shadow-md"
                      >
                        📄 View Documents →
                      </button>
                    )}

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
                              className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              maxLength={14}
                            />
                            <button
                              onClick={() => {
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
                              className="w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium 
                                     hover:bg-blue-700 transition disabled:opacity-50 active:scale-95"
                            >
                              {verificationLoading
                                ? "Sending..."
                                : "Send Verification Code"}
                            </button>
                          </div>
                        </div>
                      )}

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
                              className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
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
                              className="w-full px-3 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium 
                                     hover:bg-green-700 transition disabled:opacity-50 active:scale-95"
                            >
                              {verificationLoading
                                ? "Verifying..."
                                : "Verify Code"}
                            </button>
                          </div>
                        </div>
                      )}

                    {msg.role === "assistant" &&
                      isVerified &&
                      msg.extra?.showServiceButtons && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm font-medium text-green-800 mb-2">
                            ✓ Phone number verified
                          </p>
                          <button
                            disabled
                            className="w-full px-3 py-2.5 bg-gray-300 text-gray-600 rounded-lg text-sm font-medium 
                                     cursor-not-allowed"
                          >
                            Verified
                          </button>
                        </div>
                      )}

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

                                <div className="flex flex-col sm:flex-row gap-2">
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
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 
                                             bg-green-600 text-white rounded-lg text-sm font-medium 
                                             hover:bg-green-700 transition active:scale-95"
                                      >
                                        <Phone className="w-4 h-4" />
                                        Call Claims
                                      </a>

                                      <a
                                        href={company.claimLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 
                                             bg-blue-600 text-white rounded-lg text-sm font-medium 
                                             hover:bg-blue-700 transition active:scale-95"
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
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 
                                           bg-purple-600 text-white rounded-lg text-sm font-medium 
                                           hover:bg-purple-700 transition active:scale-95"
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

                    {msg.role === "assistant" &&
                      msg.extra?.requestLiveAgent &&
                      !msg.extra?.liveAgentFormSubmitted &&
                      !isLiveChat && (
                        <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm font-medium text-purple-800 mb-2">
                            Connect with a Live Agent
                          </p>
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={liveAgentName}
                              onChange={(e) => setLiveAgentName(e.target.value)}
                              placeholder="Your Name"
                              className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <input
                              type="tel"
                              value={liveAgentPhone}
                              onChange={(e) =>
                                setLiveAgentPhone(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  liveAgentName.trim() &&
                                  liveAgentPhone.trim()
                                ) {
                                  connectToLiveChat(
                                    liveAgentName,
                                    liveAgentPhone
                                  );
                                }
                              }}
                              placeholder="Phone Number"
                              className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                              maxLength={14}
                            />
                            <button
                              onClick={() =>
                                connectToLiveChat(liveAgentName, liveAgentPhone)
                              }
                              disabled={
                                !liveAgentName.trim() || !liveAgentPhone.trim()
                              }
                              className="w-full px-3 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium 
                         hover:bg-purple-700 transition disabled:opacity-50 active:scale-95"
                            >
                              Connect to Live Agent
                            </button>
                          </div>
                        </div>
                      )}

                    {msg.role === "assistant" &&
                      msg.extra?.liveAgentFormSubmitted && (
                        <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm font-medium text-purple-800">
                            ✓ Request submitted. Connecting you to an agent...
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="mr-auto bg-gray-100 p-3 rounded-xl max-w-[85%] sm:max-w-[75%] border border-gray-200 min-h-[52px] flex items-center">
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
                  <span className="text-gray-500 text-sm">
                    Samantha is typing...
                  </span>
                </div>
              </div>
            )}

            {agentTyping && isLiveChat && (
              <div className="mr-auto bg-gray-100 p-3 rounded-xl max-w-[85%] sm:max-w-[75%] border border-gray-200 min-h-[52px] flex items-center">
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
                  <span className="text-gray-500 text-sm">
                    {agentName || "Agent"} is typing...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {showConfirmClose && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
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
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition font-medium text-sm active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCloseChat}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition font-medium text-sm active:scale-95"
                    >
                      Close Chat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showConfirmClose && (
            <div className="p-3 sm:p-4 border-t flex items-center gap-2 bg-gray-50 sm:rounded-b-2xl flex-shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-600 hover:text-gray-800 transition flex-shrink-0"
                type="button"
                aria-label="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 text-gray-600 hover:text-gray-800 transition"
                  type="button"
                  aria-label="Add emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {showEmojiPicker && (
                  <div className="absolute bottom-12 left-0 z-50">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        setInput(input + emojiData.emoji);
                        setShowEmojiPicker(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  if (e.target.value.length <= maxInputLength) {
                    handleCustomerTyping(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about coverage, claims..."
                className="flex-1 px-3 py-2.5 text-sm rounded-xl border 
                          focus:outline-none focus:ring-2 focus:ring-red-500/30
                          disabled:opacity-50 min-w-0"
                maxLength={maxInputLength}
                disabled={loading}
                suppressHydrationWarning
              />
              <div className="text-xs text-gray-400 hidden sm:block min-w-[45px] text-right flex-shrink-0">
                {input.length}/{maxInputLength}
              </div>
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 rounded-xl shadow 
                          bg-gradient-to-r from-red-700 to-blue-800 
                          text-white text-sm font-medium hover:opacity-90 transition
                          disabled:opacity-50 disabled:cursor-not-allowed
                          active:scale-95 flex-shrink-0"
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
