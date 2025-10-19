// Chatbutton.tsx

import { useState, useEffect, useRef, useCallback } from "react";
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

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

const CHAT_STORAGE_KEY = "texas-premium-chat-session";
const CHAT_EXPIRY_TIME = 60 * 60 * 1000; // 1 hour in milliseconds

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
  id?: string;
  _id?: string;
}

interface CustomerData {
  name: string;
  company_name: string;
  policy_number: string;
  coverage_type: string;
  status: string;
  requestedService?: "claim" | "payment";
  allPolicies?: Array<{
    name: string;
    company_name: string;
    policy_number: string;
    coverage_type: string;
    status: string;
  }>;
}

interface CompanyDatabase {
  [key: string]: {
    name: string;
    claimPhone?: string;
    claimLink?: string;
    paymentLink?: string;
  };
}

interface StoredChatSession {
  messages: Message[];
  isLiveChat: boolean;
  liveAgentName: string;
  liveAgentPhone: string;
  isConnectedToAgent: boolean;
  agentName: string;
  userId: string;
  timestamp: number;
  isVerified: boolean;
  customerData: CustomerData | null;
  sessionEnded: boolean;
}

const saveChatToStorage = (sessionData: StoredChatSession) => {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.error("Failed to save chat to storage:", error);
  }
};

const loadChatFromStorage = (): StoredChatSession | null => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return null;

    const session: StoredChatSession = JSON.parse(stored);
    const now = Date.now();

    // ✅ ADD THIS: Don't restore if session was ended
    if (session.sessionEnded) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return null;
    }

    // Check if session expired (1 hour)
    if (now - session.timestamp > CHAT_EXPIRY_TIME) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Failed to load chat from storage:", error);
    return null;
  }
};

const clearChatFromStorage = () => {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear chat from storage:", error);
  }
};

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
  const [keepKeyboardOpen, setKeepKeyboardOpen] = useState(false);
  const [currentPolicyIndex, setCurrentPolicyIndex] = useState(0);

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
  const [showLiveAgentForm, setShowLiveAgentForm] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Notification sound
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);

  const router = useRouter();

  // Initialize notification sound
  useEffect(() => {
    if (typeof window !== "undefined") {
      notificationSoundRef.current = new Audio("/customer_notification.mp3");
      notificationSoundRef.current.volume = 1.0;
    }
  }, []);

  // Play notification sound
  const playNotificationSound = () => {
    if (notificationSoundRef.current) {
      notificationSoundRef.current.currentTime = 0;
      notificationSoundRef.current
        .play()
        .catch((e) => console.log("Sound play failed:", e));
    }
  };

  // Show browser notification with sound
  const showNotification = (title: string, body: string, playSound = true) => {
    if (playSound) {
      playNotificationSound();
    }

    if (Notification.permission === "granted" && document.hidden) {
      new Notification(title, {
        body,
        icon: "/logo.png",
        badge: "/logo.png",
        tag: "chat-notification",
        requireInteraction: false,
      });
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      if (window.visualViewport && chatContainerRef.current) {
        const viewport = window.visualViewport;
        const isMobile = window.innerWidth < 640;

        if (isMobile) {
          requestAnimationFrame(() => {
            if (chatContainerRef.current) {
              const viewportHeight = viewport.height;
              const offsetTop = viewport.offsetTop || 0;

              chatContainerRef.current.style.height = `${viewportHeight}px`;
              chatContainerRef.current.style.top = `${offsetTop}px`;
              chatContainerRef.current.style.position = "fixed";
            }
          });
        }
      }
    };

    const handleFocus = () => {
      setKeepKeyboardOpen(true);

      if (document.body && window.innerWidth < 640) {
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.height = "100%";
      }

      setTimeout(() => {
        if (inputRef.current && chatContainerRef.current) {
          const messagesContainer = chatContainerRef.current.querySelector(
            "[data-messages-container]"
          );
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      }, 300);
    };

    const handleBlur = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;

      if (relatedTarget && chatContainerRef.current?.contains(relatedTarget)) {
        return;
      }

      if (
        !relatedTarget ||
        !chatContainerRef.current?.contains(relatedTarget)
      ) {
        setTimeout(() => {
          const activeEl = document.activeElement as HTMLElement;
          if (!chatContainerRef.current?.contains(activeEl)) {
            setKeepKeyboardOpen(false);
            if (document.body && window.innerWidth < 640) {
              document.body.style.overflow = "";
              document.body.style.position = "";
              document.body.style.width = "";
              document.body.style.height = "";
            }
          }
        }, 100);
      }
    };

    handleResize();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
    }

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener("focus", handleFocus);
      inputElement.addEventListener("blur", handleBlur);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
        window.visualViewport.removeEventListener("scroll", handleResize);
      }
      if (inputElement) {
        inputElement.removeEventListener("focus", handleFocus);
        inputElement.removeEventListener("blur", handleBlur);
      }

      if (document.body) {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.height = "";
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
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
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
    if (agentTyping) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [agentTyping]);

  useEffect(() => {
    if (open && window.innerWidth < 640) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          setKeepKeyboardOpen(true);
        }
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !keepKeyboardOpen) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        chatContainerRef.current?.contains(target) &&
        target !== inputRef.current &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open, keepKeyboardOpen]);

  useEffect(() => {
    if (open && !loading && !showConfirmClose) {
      inputRef.current?.focus();
    }
  }, [messages, loading, open, showConfirmClose]);

  // Restore chat session on mount
  useEffect(() => {
    const restoredSession = loadChatFromStorage();

    if (restoredSession) {
      console.log("🔄 Restoring chat session from storage");
      setMessages(restoredSession.messages);
      setIsLiveChat(restoredSession.isLiveChat);
      setLiveAgentName(restoredSession.liveAgentName);
      setLiveAgentPhone(restoredSession.liveAgentPhone);
      setIsConnectedToAgent(restoredSession.isConnectedToAgent);
      setAgentName(restoredSession.agentName);
      setIsVerified(restoredSession.isVerified);
      setCustomerData(restoredSession.customerData);

      // If it was a live chat, reconnect to socket
      if (restoredSession.isLiveChat) {
        connectToLiveChat(
          restoredSession.liveAgentName,
          restoredSession.liveAgentPhone
        );
      }
    }
  }, []);

  // Save chat session to storage whenever critical state changes
  // Save chat session to storage whenever critical state changes
  useEffect(() => {
    if (messages.length > 0 || isLiveChat) {
      const userId = localStorage.getItem("chat-user-id") || "";

      const sessionData: StoredChatSession = {
        messages,
        isLiveChat,
        liveAgentName,
        liveAgentPhone,
        isConnectedToAgent,
        agentName,
        userId,
        timestamp: Date.now(),
        isVerified,
        customerData,
        sessionEnded: false, // ✅ ADD THIS
      };

      saveChatToStorage(sessionData);
    }
  }, [
    messages,
    isLiveChat,
    liveAgentName,
    liveAgentPhone,
    isConnectedToAgent,
    agentName,
    isVerified,
    customerData,
  ]);

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
    customers?: CustomerData[]; // ✅ Changed from customer to customers
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

      // ✅ API now returns array of customers
      if (data.Data && Array.isArray(data.Data)) {
        return {
          found: true,
          customers: data.Data.map(
            (customer: {
              customer_name: string;
              company_name: string;
              policy_no: string;
              coverage_type: string;
              status: string;
            }) => ({
              name: customer.customer_name,
              company_name: customer.company_name,
              policy_number: customer.policy_no,
              coverage_type: customer.coverage_type,
              status: customer.status,
            })
          ),
        };
      } else if (data.Data) {
        // Fallback: if API still returns single object (shouldn't happen now)
        return {
          found: true,
          customers: [
            {
              name: data.Data.customer_name,
              company_name: data.Data.company_name,
              policy_number: data.Data.policy_no,
              coverage_type: data.Data.coverage_type,
              status: data.Data.status,
            },
          ],
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

      // ✅ Updated to handle customers array
      if (
        !customerCheck.found ||
        !customerCheck.customers ||
        customerCheck.customers.length === 0
      ) {
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

      // ✅ Store first customer for basic info, but keep all policies
      const firstCustomer = customerCheck.customers[0];
      setCustomerData({
        name: firstCustomer.name || "Unknown",
        company_name: firstCustomer.company_name || "Unknown",
        policy_number: firstCustomer.policy_number || "Unknown",
        coverage_type: firstCustomer.coverage_type || "Unknown",
        status: firstCustomer.status || "Unknown",
        requestedService: serviceType || "payment",
        allPolicies: customerCheck.customers, // ✅ Store ALL policies
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

      if (customerData && customerData.allPolicies) {
        // Reset to first policy when showing service buttons
        setCurrentPolicyIndex(0);

        const serviceType = customerData.requestedService || "payment";

        // Map all policies to company info
        const allCompaniesWithInfo = customerData.allPolicies.map((policy) => {
          let bestMatch = null;
          let highestSimilarity = 0;
          const SIMILARITY_THRESHOLD = 0.3;

          for (const companyName of Object.keys(companyDatabase)) {
            const similarity = getStringSimilarity(
              policy.company_name,
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
                name: policy.company_name,
                claimPhone: "Contact your agent",
                claimLink: "Contact your agent",
                paymentLink: "Contact your agent",
              };

          return {
            name: policy.company_name,
            policyNo: policy.policy_number,
            claimPhone: companyInfo.claimPhone,
            claimLink: companyInfo.claimLink,
            paymentLink: companyInfo.paymentLink,
          };
        });

        const messageContent =
          customerData.allPolicies.length > 1
            ? `✅ Identity verified! Hi ${customerData.name}!\n\nYou have ${customerData.allPolicies.length} active policies. Use the Previous/Next buttons to navigate between them.`
            : `✅ Identity verified! Hi ${customerData.name}!\n\nHere are your ${serviceType} options:`;

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: messageContent,
            extra: {
              showServiceButtons: {
                type: serviceType,
                companies: allCompaniesWithInfo,
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

  const handleLiveAgentPhoneChange = (value: string) => {
    // Only allow digits and limit to 10
    const digitsOnly = value.replace(/\D/g, "");
    if (digitsOnly.length <= 10) {
      setLiveAgentPhone(digitsOnly);
    }
  };

  const connectToLiveChat = useCallback((name: string, phone: string) => {
    // ✅ CLEAR OLD SESSION AND CREATE FRESH ONE
    // Remove old user ID to force new session creation
    localStorage.removeItem("chat-user-id");

    // Clear any existing socket connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Clear old chat storage to prevent restoration of ended session
    clearChatFromStorage();

    setLiveAgentName(name);
    setLiveAgentPhone(phone);
    setIsLiveChat(true);

    // ✅ CREATE NEW USER ID FOR FRESH SESSION
    const userId = `user-${Math.random()
      .toString(36)
      .substr(2, 9)}-${Date.now()}`;
    localStorage.setItem("chat-user-id", userId);

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ["websocket", "polling"],
    });

    socketRef.current.on("connect", () => {
      console.log("Connected to live chat server");

      socketRef.current?.emit("customer-join", {
        userId,
        userName: name,
        userPhone: phone,
        conversationHistory: [], // ✅ Start fresh - no old history
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connecting you to a live agent... Please wait.",
          extra: { liveAgentFormSubmitted: true },
        },
      ]);

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      heartbeatInterval.current = setInterval(() => {
        if (socketRef.current?.connected) {
          socketRef.current.emit("heartbeat", {
            userId,
            userType: "customer",
          });
        }
      }, 30000);
    });

    socketRef.current.on("reconnect_attempt", (attempt: number) => {
      console.log(`Reconnection attempt ${attempt}...`);
    });

    socketRef.current.on("reconnect", () => {
      console.log("Reconnected successfully");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Reconnected to chat.",
          extra: null,
        },
      ]);
    });

    socketRef.current.on(
      "chat-history",
      (
        history: Array<{
          content: string;
          isAdmin: boolean;
          userName?: string;
          fileUrl?: string;
          fileName?: string;
          timestamp: string;
        }>
      ) => {
        if (history && history.length > 0) {
          const restoredMessages: Message[] = history.map((msg) => ({
            role: msg.isAdmin ? "assistant" : "user",
            content: msg.content,
            userName: msg.userName,
            fileUrl: msg.fileUrl,
            fileName: msg.fileName,
            extra: null,
          }));
          setMessages(restoredMessages);
        }
      }
    );

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

        showNotification("Agent Joined", message);
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
        id?: string;
      }) => {
        // Show ALL messages (both customer and admin)
        setMessages((prev) => {
          // Check if message already exists
          const exists = prev.some((m) => m.id === message.id);
          if (exists) return prev;

          return [
            ...prev,
            {
              role: message.isAdmin ? "assistant" : "user",
              content: message.content,
              userName: message.userName,
              fileUrl: message.fileUrl,
              fileName: message.fileName,
              id: message.id,
              extra: null,
            },
          ];
        });

        if (message.isAdmin) {
          setAgentTyping(false);
          showNotification(message.userName || "Agent", message.content);
        }
      }
    );

    socketRef.current.on(
      "message-deleted",
      ({ messageId }: { messageId: string }) => {
        console.log(`🗑️ Message ${messageId} was deleted`);
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
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
      showNotification("Agent Left", message);
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

        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }

        // ✅ MARK AS ENDED BEFORE CLEARING
        const userId = localStorage.getItem("chat-user-id") || "";
        const sessionData: StoredChatSession = {
          messages,
          isLiveChat: false,
          liveAgentName,
          liveAgentPhone,
          isConnectedToAgent: false,
          agentName,
          userId,
          timestamp: Date.now(),
          isVerified,
          customerData,
          sessionEnded: true, // ✅ Mark as ended
        };
        saveChatToStorage(sessionData);

        socketRef.current?.disconnect();

        // Clear after a short delay
        setTimeout(() => {
          clearChatFromStorage();
        }, 1000);

        showNotification("Chat Ended", message || "Chat session ended");
      }
    );

    socketRef.current.on("disconnect", (reason: string) => {
      console.log("Disconnected from live chat server:", reason);

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }

      if (reason === "io server disconnect" || reason === "transport close") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Connection lost. Attempting to reconnect...",
            extra: null,
          },
        ]);
      }
    });

    socketRef.current.on("connect_error", (error: Error) => {
      console.error("Connection error:", error);
    });

    socketRef.current.on(
      "message-deleted",
      ({ messageId }: { messageId: string }) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      }
    );
  }, []);

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

    // Check for filing claims - MORE COMPREHENSIVE
    const isActuallyFiling =
      lowerMessage.includes("file a claim") ||
      lowerMessage.includes("file claim") ||
      lowerMessage.includes("open a claim") ||
      lowerMessage.includes("start a claim") ||
      lowerMessage.includes("report a claim") ||
      lowerMessage.includes("submit a claim") ||
      lowerMessage.includes("submit claim") ||
      lowerMessage.includes("need to file") ||
      lowerMessage.includes("want to file") ||
      lowerMessage.includes("how do i file") ||
      lowerMessage.includes("how to file") ||
      lowerMessage.includes("filing a claim") ||
      lowerMessage === "file" ||
      lowerMessage === "claim" ||
      (lowerMessage.includes("claim") &&
        (lowerMessage.includes("start") ||
          lowerMessage.includes("open") ||
          lowerMessage.includes("submit") ||
          lowerMessage.includes("report") ||
          lowerMessage.includes("file")));

    // Check for making payments - MORE COMPREHENSIVE
    const isActuallyPaying =
      lowerMessage.includes("make a payment") ||
      lowerMessage.includes("make payment") ||
      lowerMessage.includes("payment link") ||
      lowerMessage.includes("pay link") ||
      lowerMessage.includes("pay my bill") ||
      lowerMessage.includes("pay bill") ||
      lowerMessage.includes("pay the bill") ||
      lowerMessage.includes("how do i pay") ||
      lowerMessage.includes("how to pay") ||
      lowerMessage.includes("where do i pay") ||
      lowerMessage.includes("making a payment") ||
      (lowerMessage.includes("pay") && lowerMessage.includes("bill")) ||
      (lowerMessage.includes("pay") && lowerMessage.includes("policy")) ||
      lowerMessage === "pay" ||
      lowerMessage === "payment" ||
      (lowerMessage.includes("can i") && lowerMessage.includes("pay")) ||
      (lowerMessage.includes("i want to") && lowerMessage.includes("pay")) ||
      (lowerMessage.includes("need to") && lowerMessage.includes("pay"));

    // INTERCEPT BEFORE API - Trigger verification immediately
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

    // If already verified and asking about claims/payments again, show service buttons
    if (isVerified && isActuallyFiling && customerData?.allPolicies) {
      return {
        content: "Here are your claim options:",
        extra: {
          showServiceButtons: {
            type: "claim",
            companies: customerData.allPolicies.map((policy) => {
              let bestMatch = null;
              let highestSimilarity = 0;
              const SIMILARITY_THRESHOLD = 0.3;

              for (const companyName of Object.keys(companyDatabase)) {
                const similarity = getStringSimilarity(
                  policy.company_name,
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
                    name: policy.company_name,
                    claimPhone: "Contact your agent",
                    claimLink: "Contact your agent",
                    paymentLink: "Contact your agent",
                  };

              return {
                name: policy.company_name,
                policyNo: policy.policy_number,
                claimPhone: companyInfo.claimPhone,
                claimLink: companyInfo.claimLink,
                paymentLink: companyInfo.paymentLink,
              };
            }),
          },
        },
      };
    }

    if (isVerified && isActuallyPaying && customerData?.allPolicies) {
      return {
        content: "Here are your payment options:",
        extra: {
          showServiceButtons: {
            type: "payment",
            companies: customerData.allPolicies.map((policy) => {
              let bestMatch = null;
              let highestSimilarity = 0;
              const SIMILARITY_THRESHOLD = 0.3;

              for (const companyName of Object.keys(companyDatabase)) {
                const similarity = getStringSimilarity(
                  policy.company_name,
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
                    name: policy.company_name,
                    claimPhone: "Contact your agent",
                    claimLink: "Contact your agent",
                    paymentLink: "Contact your agent",
                  };

              return {
                name: policy.company_name,
                policyNo: policy.policy_number,
                claimPhone: companyInfo.claimPhone,
                claimLink: companyInfo.claimLink,
                paymentLink: companyInfo.paymentLink,
              };
            }),
          },
        },
      };
    }

    // Otherwise, let API handle it
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

    if (window.innerWidth < 640 && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }

    if (isLiveChat && socketRef.current) {
      const userId = localStorage.getItem("chat-user-id");
      socketRef.current.emit("customer-typing", {
        userId,
        isTyping: false,
      });
    }

    // // ✅ FIX: Always add user message to local state first
    // setMessages((prev) => [...prev, newMessage]);

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

    try {
      const aiResponse = getAIResponse(currentInput);

      // ✅ ADD THIS CHECK - If aiResponse has content, use it immediately
      if (aiResponse.content && !aiResponse.shouldDeferToAPI) {
        setMessages((prev) => [
          ...prev,
          newMessage, // Add user message
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
      const requestLiveAgent =
        data.choices?.[0]?.message?.requestLiveAgent || false;

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
      } else if (requestLiveAgent) {
        finalExtra = { requestLiveAgent: true };
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

    // ✅ Clear storage immediately when manually closing the chat window
    clearChatFromStorage();

    // Also clear the user ID so a fresh one is generated next time
    localStorage.removeItem("chat-user-id");

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
    setShowLiveAgentForm(false);
    setKeepKeyboardOpen(false);

    if (document.body) {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    }
  };

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

      // Prevent multiple uploads
      if (isUploadingFile) {
        return;
      }

      setIsUploadingFile(true);
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
          const fileMessage: Message = {
            role: "user",
            content: `📎 Sent file: ${file.name}`,
            fileUrl: data.fileUrl,
            fileName: file.name,
            extra: null,
          };

          // ✅ DON'T add to messages here if in live chat - server will broadcast it
          // Only add locally if NOT in live chat (AI chat mode)
          if (!isLiveChat) {
            setMessages((prev) => [...prev, fileMessage]);
          }

          // If in live chat, emit to socket (server will broadcast to both customer and admin)
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
        } else {
          throw new Error(data.error || "Upload failed");
        }

        setSelectedFile(null);
      } catch (error) {
        console.error("File upload error:", error);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "❌ Failed to upload file. Please try again or contact support.",
            extra: null,
          },
        ]);
      } finally {
        setIsUploadingFile(false);
        // Reset the file input
        if (e.target) {
          e.target.value = "";
        }
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
                      z-[9999]
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

                    // ✅ MARK SESSION AS ENDED BEFORE CLEARING
                    const sessionData: StoredChatSession = {
                      messages,
                      isLiveChat,
                      liveAgentName,
                      liveAgentPhone,
                      isConnectedToAgent,
                      agentName,
                      userId: userId || "",
                      timestamp: Date.now(),
                      isVerified,
                      customerData,
                      sessionEnded: true, // ✅ Mark as ended
                    };
                    saveChatToStorage(sessionData);

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

                    // Clear after a short delay to ensure the end message is saved
                    setTimeout(() => {
                      clearChatFromStorage();
                    }, 1000);

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
              messages.map((msg, idx) => {
                // Find the index of the most recent live agent request
                let latestLiveAgentIndex = -1;
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (
                    messages[i].role === "assistant" &&
                    messages[i].extra?.requestLiveAgent &&
                    !isLiveChat
                  ) {
                    latestLiveAgentIndex = i;
                    break;
                  }
                }

                // Check if this is the most recent live agent request
                const isLatestLiveAgentRequest =
                  msg.role === "assistant" &&
                  msg.extra?.requestLiveAgent &&
                  !isLiveChat &&
                  idx === latestLiveAgentIndex;

                return (
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

                      <div className="whitespace-pre-line text-sm break-words">
                        {msg.content}
                      </div>

                      {msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition max-w-full"
                        >
                          <Paperclip className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">
                            {msg.fileName && msg.fileName.length > 30
                              ? `${msg.fileName.substring(0, 27)}...`
                              : msg.fileName || "Download file"}
                          </span>
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
                          onClick={() =>
                            handleQuoteNavigation("view_documents")
                          }
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
                                      (msg.content
                                        .toLowerCase()
                                        .includes("claim")
                                        ? "claim"
                                        : "payment");
                                    sendVerificationCode(
                                      phoneInput,
                                      serviceType
                                    );
                                  }
                                }}
                                placeholder="(555) 123-4567"
                                className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ fontSize: "16px" }}
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
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 6)
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
                                style={{ fontSize: "16px" }}
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
                            {/* Policy Card */}
                            <div className="p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-gray-200 shadow-sm">
                              {/* Policy counter at top */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1">
                                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                                    Insurance Company
                                  </div>
                                  <div className="font-bold text-gray-900 text-base">
                                    {
                                      msg.extra.showServiceButtons.companies[
                                        currentPolicyIndex
                                      ].name
                                    }
                                  </div>
                                </div>
                                {msg.extra.showServiceButtons.companies.length >
                                  1 && (
                                  <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-sm">
                                    {currentPolicyIndex + 1}/
                                    {
                                      msg.extra.showServiceButtons.companies
                                        .length
                                    }
                                  </div>
                                )}
                              </div>

                              <div className="bg-blue-50 px-3 py-2 rounded-lg mb-3">
                                <div className="text-xs text-blue-600 font-medium">
                                  Policy Number
                                </div>
                                <div className="text-sm font-mono font-semibold text-blue-900">
                                  {
                                    msg.extra.showServiceButtons.companies[
                                      currentPolicyIndex
                                    ].policyNo
                                  }
                                </div>
                              </div>

                              <div className="flex flex-col gap-2">
                                {msg.extra.showServiceButtons.type ===
                                "claim" ? (
                                  <>
                                    {msg.extra.showServiceButtons.companies[
                                      currentPolicyIndex
                                    ].claimPhone === "Contact your agent" ||
                                    !msg.extra.showServiceButtons.companies[
                                      currentPolicyIndex
                                    ].claimPhone ? (
                                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-sm font-medium text-amber-900 mb-2">
                                          📞 Please contact your agent for
                                          claims assistance
                                        </p>
                                        <div className="flex flex-col gap-2">
                                          <a
                                            href="tel:4697295185"
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 
              bg-green-600 text-white rounded-lg text-sm font-medium 
              hover:bg-green-700 transition active:scale-95"
                                          >
                                            <Phone className="w-4 h-4" />
                                            Call (469) 729-5185
                                          </a>
                                          <a
                                            href="mailto:support@TexasPremiumIns.com"
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 
              bg-blue-600 text-white rounded-lg text-sm font-medium 
              hover:bg-blue-700 transition active:scale-95"
                                          >
                                            ✉️ Email Support
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <a
                                          href={`tel:${
                                            msg.extra.showServiceButtons.companies[
                                              currentPolicyIndex
                                            ].claimPhone?.replace(/\D/g, "") ||
                                            ""
                                          }`}
                                          className="flex items-center justify-center gap-2 px-4 py-3 
            bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg text-sm font-medium 
            hover:from-green-700 hover:to-green-800 transition active:scale-95 shadow-md"
                                        >
                                          <Phone className="w-4 h-4" />
                                          Call Claims Department
                                        </a>

                                        {msg.extra.showServiceButtons.companies[
                                          currentPolicyIndex
                                        ].claimLink !==
                                          "Contact your agent" && (
                                          <a
                                            href={
                                              msg.extra.showServiceButtons
                                                .companies[currentPolicyIndex]
                                                .claimLink
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 px-4 py-3 
              bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium 
              hover:from-blue-700 hover:to-blue-800 transition active:scale-95 shadow-md"
                                          >
                                            <Globe className="w-4 h-4" />
                                            Visit Claims Website
                                          </a>
                                        )}
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {msg.extra.showServiceButtons.companies[
                                      currentPolicyIndex
                                    ].paymentLink === "Contact your agent" ||
                                    !msg.extra.showServiceButtons.companies[
                                      currentPolicyIndex
                                    ].paymentLink ? (
                                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-sm font-medium text-amber-900 mb-2">
                                          📞 Please contact your agent for
                                          payment assistance
                                        </p>
                                        <div className="flex flex-col gap-2">
                                          <a
                                            href="tel:4697295185"
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 
                        bg-green-600 text-white rounded-lg text-sm font-medium 
                        hover:bg-green-700 transition active:scale-95"
                                          >
                                            <Phone className="w-4 h-4" />
                                            Call (469) 729-5185
                                          </a>
                                          <a
                                            href="mailto:support@TexasPremiumIns.com"
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 
                        bg-blue-600 text-white rounded-lg text-sm font-medium 
                        hover:bg-blue-700 transition active:scale-95"
                                          >
                                            ✉️ Email Support
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      <a
                                        href={
                                          msg.extra.showServiceButtons
                                            .companies[currentPolicyIndex]
                                            .paymentLink
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 px-4 py-3 
                    bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg text-sm font-medium 
                    hover:from-purple-700 hover:to-purple-800 transition active:scale-95 shadow-md"
                                      >
                                        <Globe className="w-4 h-4" />
                                        Make Payment Online
                                      </a>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* Navigation buttons at bottom - only show if multiple policies */}
                              {msg.extra.showServiceButtons.companies.length >
                                1 && (
                                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200">
                                  <button
                                    onClick={() => {
                                      setCurrentPolicyIndex((prev) =>
                                        prev > 0
                                          ? prev - 1
                                          : msg.extra!.showServiceButtons!
                                              .companies.length - 1
                                      );
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition active:scale-95 shadow-sm"
                                  >
                                    <span className="text-lg">←</span>
                                    <span>Previous</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setCurrentPolicyIndex((prev) =>
                                        prev <
                                        msg.extra!.showServiceButtons!.companies
                                          .length -
                                          1
                                          ? prev + 1
                                          : 0
                                      );
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition active:scale-95 shadow-sm"
                                  >
                                    <span>Next</span>
                                    <span className="text-lg">→</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      {msg.role === "assistant" &&
                        msg.extra?.requestLiveAgent &&
                        !isLiveChat && (
                          <>
                            {isLatestLiveAgentRequest && !showLiveAgentForm ? (
                              <button
                                onClick={() => setShowLiveAgentForm(true)}
                                className="mt-3 w-full sm:w-auto inline-block px-4 py-2.5 rounded-lg text-white 
                                     bg-gradient-to-r from-red-700 to-blue-800 
                                     text-sm font-medium hover:opacity-90 transition-all duration-200
                                     active:scale-95 shadow-md"
                              >
                                💬 Connect to Live Agent
                              </button>
                            ) : isLatestLiveAgentRequest &&
                              showLiveAgentForm ? (
                              <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                                <p className="text-sm font-medium text-purple-800 mb-2">
                                  Connect with a Live Agent
                                </p>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={liveAgentName}
                                    onChange={(e) =>
                                      setLiveAgentName(e.target.value)
                                    }
                                    placeholder="Your Name"
                                    className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    style={{ fontSize: "16px" }}
                                  />
                                  <input
                                    type="tel"
                                    value={liveAgentPhone}
                                    onChange={(e) =>
                                      handleLiveAgentPhoneChange(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        liveAgentName.trim() &&
                                        liveAgentPhone.length === 10
                                      ) {
                                        connectToLiveChat(
                                          liveAgentName,
                                          liveAgentPhone
                                        );
                                        setShowLiveAgentForm(false);
                                      }
                                    }}
                                    placeholder="Phone Number (10 digits)"
                                    className="w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    style={{ fontSize: "16px" }}
                                    maxLength={10}
                                  />
                                  {liveAgentPhone.length > 0 &&
                                    liveAgentPhone.length < 10 && (
                                      <p className="text-xs text-red-600">
                                        Please enter exactly 10 digits
                                      </p>
                                    )}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        // ✅ Clear previous messages before connecting
                                        setMessages([]);
                                        setIsVerified(false);
                                        setCustomerData(null);

                                        connectToLiveChat(
                                          liveAgentName,
                                          liveAgentPhone
                                        );
                                        setShowLiveAgentForm(false);
                                      }}
                                      disabled={
                                        !liveAgentName.trim() ||
                                        liveAgentPhone.length !== 10
                                      }
                                      className="flex-1 px-3 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium 
                                 hover:bg-purple-700 transition disabled:opacity-50 active:scale-95"
                                    >
                                      Connect
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowLiveAgentForm(false);
                                        setLiveAgentName("");
                                        setLiveAgentPhone("");
                                      }}
                                      className="px-3 py-2.5 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium 
                                 hover:bg-gray-400 transition active:scale-95"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                disabled
                                className="mt-3 w-full sm:w-auto inline-block px-4 py-2.5 rounded-lg text-white 
                                     bg-gray-400 
                                     text-sm font-medium cursor-not-allowed opacity-50"
                              >
                                💬 Connect to Live Agent
                              </button>
                            )}
                          </>
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
                );
              })
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
                disabled={isUploadingFile}
                className={`p-2 transition flex-shrink-0 ${
                  isUploadingFile
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-gray-600 hover:text-gray-800"
                }`}
                type="button"
                aria-label="Attach file"
              >
                {isUploadingFile ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>

              {isUploadingFile && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 animate-pulse"
                    style={{ width: "100%" }}
                  />
                </div>
              )}
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
                onBlur={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement;

                  if (
                    relatedTarget &&
                    chatContainerRef.current?.contains(relatedTarget) &&
                    (relatedTarget.tagName === "INPUT" ||
                      relatedTarget.tagName === "TEXTAREA" ||
                      relatedTarget.tagName === "BUTTON")
                  ) {
                    return;
                  }

                  if (
                    keepKeyboardOpen &&
                    window.innerWidth < 640 &&
                    !relatedTarget
                  ) {
                    setTimeout(() => {
                      const activeEl = document.activeElement as HTMLElement;
                      if (
                        !chatContainerRef.current?.contains(activeEl) ||
                        (activeEl.tagName !== "INPUT" &&
                          activeEl.tagName !== "TEXTAREA")
                      ) {
                        inputRef.current?.focus();
                      }
                    }, 100);
                  }
                }}
                placeholder="Ask about coverage, claims..."
                className="flex-1 px-3 py-2.5 text-sm rounded-xl border 
                          focus:outline-none focus:ring-2 focus:ring-red-500/30
                          disabled:opacity-50 min-w-0"
                style={{ fontSize: "16px" }}
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
