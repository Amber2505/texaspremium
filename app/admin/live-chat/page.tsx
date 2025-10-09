"use client";
import { useState, useEffect, useRef } from "react";
import {
  Send,
  Users,
  X,
  Clock,
  Paperclip,
  Smile,
  Eye,
  EyeOff,
  ChevronDown,
  Loader2,
  LogOut,
  Search,
  Filter,
  Download,
  MessageSquare,
  Zap,
  StickyNote,
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  Menu,
} from "lucide-react";
import io from "socket.io-client";
import EmojiPicker from "emoji-picker-react";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

interface ChatMessage {
  id: string;
  content: string;
  isAdmin: boolean;
  timestamp: string;
  userName?: string;
  fileUrl?: string;
  fileName?: string;
  read?: boolean;
}

interface ChatSession {
  userId: string;
  userName: string;
  userPhone?: string;
  socketId: string;
  joinedAt: string;
  lastSeen?: string;
  isActive: boolean;
  hasAgent: boolean;
  agentName?: string;
  conversationHistory: ChatMessage[];
  customerEnded?: boolean;
  adminEnded?: boolean;
  notes?: string;
  tags?: string[];
  unreadCount?: number;
}

interface AdminSession {
  name: string;
  loginTime: number;
  expiresAt: number;
}

interface QuickResponse {
  id: string;
  shortcut: string;
  message: string;
  category: string;
}

const ADMIN_PASSWORD = "Insurance2024";
const SESSION_KEY = "admin_chat_session";

const DEFAULT_QUICK_RESPONSES: QuickResponse[] = [
  {
    id: "1",
    shortcut: "/greeting",
    message:
      "Hello! Thank you for contacting Texas Premium Insurance. How can I help you today?",
    category: "Greetings",
  },
  {
    id: "2",
    shortcut: "/wait",
    message:
      "Thank you for your patience. Let me check that information for you.",
    category: "Common",
  },
  {
    id: "3",
    shortcut: "/quote",
    message:
      "I'd be happy to help you get a quote! Can you tell me what type of insurance you're interested in?",
    category: "Sales",
  },
  {
    id: "4",
    shortcut: "/claim",
    message:
      "I understand you need help with a claim. Let me verify your information first. Can you provide your policy number or the phone no. on the account please?",
    category: "Claims",
  },
  {
    id: "5",
    shortcut: "/payment",
    message:
      "For payment assistance, I can send you your payment link. Can you confirm your phone number please?",
    category: "Payments",
  },
  {
    id: "6",
    shortcut: "/callback",
    message:
      "I'll have someone call you back as soon as possible at the number on file. Is there a better number to reach you?",
    category: "Follow-up",
  },
  {
    id: "7",
    shortcut: "/thanks",
    message:
      "Thank you for contacting us! Is there anything else I can help you with today?",
    category: "Closing",
  },
  {
    id: "8",
    shortcut: "/bye",
    message:
      "Thank you for choosing Texas Premium Insurance Services! Have a great day!",
    category: "Closing",
  },
];

export default function AdminLiveChatDashboard() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(
    null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const [customerTyping, setCustomerTyping] = useState<{
    [key: string]: boolean;
  }>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loadedCount, setLoadedCount] = useState(20);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalChatsCount, setTotalChatsCount] = useState(0);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "ended" | "unassigned"
  >("all");
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [quickResponses] = useState<QuickResponse[]>(DEFAULT_QUICK_RESPONSES);
  const [sessionNotes, setSessionNotes] = useState("");
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedSessionRef = useRef<ChatSession | null>(null);

  const filteredSessions = sessions
    .filter((session) => {
      const matchesSearch =
        searchQuery === "" ||
        session.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.userPhone?.includes(searchQuery) ||
        session.userId.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (filterStatus === "active") {
        matchesStatus =
          !!session.isActive && !session.customerEnded && !session.adminEnded;
      } else if (filterStatus === "ended") {
        matchesStatus = !!(session.customerEnded || session.adminEnded);
      } else if (filterStatus === "unassigned") {
        matchesStatus = !!(!session.hasAgent && session.isActive);
      }

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const aTime = a.lastSeen || a.joinedAt;
      const bTime = b.lastSeen || b.joinedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, customerTyping]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
    }
  }, []);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const session: AdminSession = JSON.parse(savedSession);
          const now = Date.now();

          if (now < session.expiresAt) {
            console.log("✅ Restoring admin session for:", session.name);
            loginAsAdmin(session.name);
          } else {
            console.log("⏰ Session expired, clearing...");
            localStorage.removeItem(SESSION_KEY);
            setIsCheckingSession(false);
          }
        } catch (error) {
          console.error("Error parsing saved session:", error);
          localStorage.removeItem(SESSION_KEY);
          setIsCheckingSession(false);
        }
      } else {
        setIsCheckingSession(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    const checkExpiry = setInterval(() => {
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const session: AdminSession = JSON.parse(savedSession);
          const now = Date.now();

          if (now >= session.expiresAt) {
            console.log("⏰ Session expired at 11:59 PM");
            handleLogout();
          }
        } catch (error) {
          console.error("Error checking session expiry:", error);
        }
      }
    }, 60000);

    return () => clearInterval(checkExpiry);
  }, [isLoggedIn]);

  const getEndOfDayTimestamp = () => {
    const now = new Date();
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    return endOfDay.getTime();
  };

  const saveAdminSession = (name: string) => {
    const session: AdminSession = {
      name,
      loginTime: Date.now(),
      expiresAt: getEndOfDayTimestamp(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    localStorage.removeItem(SESSION_KEY);
    setIsLoggedIn(false);
    setAdminName("");
    setAdminPassword("");
    setIsConnected(false);
    setSessions([]);
    setSelectedSession(null);
    setMessages([]);
    console.log("👋 Admin logged out");
  };

  const playNotificationSound = () => {
    if (audioRef.current && notificationsEnabled) {
      audioRef.current
        .play()
        .catch((err) => console.log("Audio play failed:", err));
    }
  };

  const loadMoreChats = () => {
    if (!socketRef.current || isLoadingMore || !hasMoreChats) return;
    setIsLoadingMore(true);
    socketRef.current.emit("load-more-chats", { skip: loadedCount, limit: 20 });
  };

  const insertQuickResponse = (response: QuickResponse) => {
    setInputMessage(response.message);
    setShowQuickResponses(false);
    inputRef.current?.focus();
  };

  const handleShortcutInput = (value: string) => {
    if (value.startsWith("/")) {
      const matchingResponse = quickResponses.find(
        (qr) => qr.shortcut === value
      );
      if (matchingResponse) {
        setInputMessage(matchingResponse.message);
        return;
      }
    }
    setInputMessage(value);
  };

  const deleteChat = (userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (
      !confirm(
        "Are you sure you want to delete this chat? This action cannot be undone."
      )
    ) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit("admin-delete-chat", { userId, adminName });
      setSessions((prev) => prev.filter((s) => s.userId !== userId));

      if (selectedSession?.userId === userId) {
        setSelectedSession(null);
        setMessages([]);
      }
    }
  };

  const downloadTranscript = () => {
    if (!selectedSession) return;

    const transcript = messages
      .map((msg) => {
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const sender = msg.isAdmin
          ? msg.userName || adminName
          : selectedSession.userName;
        return `[${timestamp}] ${sender}: ${msg.content}`;
      })
      .join("\n");

    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-transcript-${selectedSession.userId}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveSessionNotes = () => {
    if (!selectedSession) return;

    const updatedSession = { ...selectedSession, notes: sessionNotes };
    setSelectedSession(updatedSession);
    setSessions((prev) =>
      prev.map((s) =>
        s.userId === selectedSession.userId ? updatedSession : s
      )
    );
    setShowNotesModal(false);
  };

  const loginAsAdmin = (name: string) => {
    setAdminName(name);
    setIsLoggedIn(true);
    setIsCheckingSession(false);
    saveAdminSession(name);

    if (!SOCKET_URL) {
      console.error("❌ NEXT_PUBLIC_SOCKET_URL is not defined");
      alert(
        "Socket URL is not configured. Please check your environment variables."
      );
      return;
    }

    console.log("Attempting to connect to:", SOCKET_URL);
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      console.log("✅ Admin connected successfully");
      setIsConnected(true);
      socketRef.current?.emit("admin-join");
    });

    socketRef.current.on("connect_error", (error: Error) => {
      console.error("❌ Connection error:", error);
      setIsConnected(false);
    });

    socketRef.current.on("active-sessions", (activeSessions: ChatSession[]) => {
      console.log("Received active sessions:", activeSessions);
      setSessions(activeSessions);
      setLoadedCount(activeSessions.length);
    });

    socketRef.current.on(
      "more-chats",
      ({
        chats,
        hasMore,
        total,
      }: {
        chats: ChatSession[];
        hasMore: boolean;
        total: number;
      }) => {
        console.log(`Received ${chats.length} more chats`);
        setSessions((prev) => {
          const existingIds = new Set(prev.map((s) => s.userId));
          const newChats = chats.filter(
            (chat) => !existingIds.has(chat.userId)
          );
          return [...prev, ...newChats];
        });
        setLoadedCount((prev) => prev + chats.length);
        setHasMoreChats(hasMore);
        setTotalChatsCount(total);
        setIsLoadingMore(false);
      }
    );

    socketRef.current.on(
      "chat-deleted",
      ({ userId, deletedBy }: { userId: string; deletedBy: string }) => {
        console.log(`Chat ${userId} was deleted by ${deletedBy}`);
        setSessions((prev) => prev.filter((s) => s.userId !== userId));
        if (selectedSessionRef.current?.userId === userId) {
          setSelectedSession(null);
          setMessages([]);
        }
      }
    );

    socketRef.current.on("delete-error", ({ message }: { message: string }) => {
      console.error("Delete error:", message);
      alert(`Failed to delete chat: ${message}`);
    });

    socketRef.current.on("customer-joined", (session: ChatSession) => {
      console.log("Customer joined:", session);
      setSessions((prev) => {
        const exists = prev.some((s) => s.userId === session.userId);
        if (exists) {
          return prev.map((s) => (s.userId === session.userId ? session : s));
        }
        return [session, ...prev];
      });
      playNotificationSound();

      if (
        typeof window !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("New Chat Request", {
          body: `${session.userName} has joined the chat`,
          icon: "/logo.png",
        });
      }
    });

    socketRef.current.on(
      "customer-message-notification",
      ({
        userId,
        message,
      }: {
        userId: string;
        userName: string;
        message: ChatMessage;
      }) => {
        setSessions((prev) =>
          prev.map((session) =>
            session.userId === userId
              ? {
                  ...session,
                  conversationHistory: [
                    ...session.conversationHistory,
                    message,
                  ],
                  lastSeen: new Date().toISOString(),
                  unreadCount:
                    selectedSessionRef.current?.userId === userId
                      ? 0
                      : (session.unreadCount || 0) + 1,
                }
              : session
          )
        );

        if (selectedSessionRef.current?.userId === userId) {
          setMessages((prev) => [...prev, message]);
        }

        const session = sessions.find((s) => s.userId === userId);
        if (!session?.hasAgent || session.agentName !== adminName) {
          playNotificationSound();
        }
      }
    );

    socketRef.current.on("new-message", (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    socketRef.current.on(
      "admin-message-sent",
      ({ userId, message }: { userId: string; message: ChatMessage }) => {
        setSessions((prev) =>
          prev.map((session) =>
            session.userId === userId
              ? {
                  ...session,
                  conversationHistory: [
                    ...session.conversationHistory,
                    message,
                  ],
                  lastSeen: new Date().toISOString(),
                }
              : session
          )
        );

        if (selectedSessionRef.current?.userId === userId) {
          setMessages((prev) => [...prev, message]);
        }
      }
    );

    socketRef.current.on("session-updated", (updatedSession: ChatSession) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.userId === updatedSession.userId
            ? { ...updatedSession, lastSeen: new Date().toISOString() }
            : s
        )
      );
    });

    socketRef.current.on(
      "customer-typing-indicator",
      ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
        setCustomerTyping((prev) => ({ ...prev, [userId]: isTyping }));
      }
    );

    socketRef.current.on(
      "customer-disconnected",
      ({ userId }: { userId: string }) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.userId === userId
              ? { ...s, isActive: false, lastSeen: new Date().toISOString() }
              : s
          )
        );
      }
    );

    socketRef.current.on(
      "customer-ended-session",
      (data: { message: string; userId: string; userName: string }) => {
        const { message, userId } = data;
        setSessions((prev) =>
          prev.map((s) =>
            s.userId === userId
              ? {
                  ...s,
                  isActive: false,
                  customerEnded: true,
                  lastSeen: new Date().toISOString(),
                }
              : s
          )
        );

        if (selectedSessionRef.current?.userId === userId) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              content: message,
              isAdmin: false,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    );

    socketRef.current.on("session-ended", ({ userId }: { userId: string }) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.userId === userId
            ? {
                ...s,
                isActive: false,
                adminEnded: true,
                lastSeen: new Date().toISOString(),
              }
            : s
        )
      );

      if (selectedSessionRef.current?.userId === userId) {
        setSelectedSession(null);
        setMessages([]);
      }
    });

    socketRef.current.on("disconnect", (reason: string) => {
      console.log("Disconnected:", reason);
      setIsConnected(false);
    });

    if (
      typeof window !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  };

  const claimCustomer = (session: ChatSession) => {
    if (session.customerEnded || session.adminEnded) {
      setSelectedSession(session);
      setMessages(session.conversationHistory || []);
      setSessionNotes(session.notes || "");
      return;
    }

    const isClaimedByMe = session.hasAgent && session.agentName === adminName;
    if (isClaimedByMe) {
      setSelectedSession(session);
      setMessages(session.conversationHistory || []);
      setSessionNotes(session.notes || "");
      setSessions((prev) =>
        prev.map((s) =>
          s.userId === session.userId ? { ...s, unreadCount: 0 } : s
        )
      );
      return;
    }

    if (socketRef.current && !session.hasAgent) {
      socketRef.current.emit("admin-claim-customer", {
        userId: session.userId,
        adminName,
      });
      setSelectedSession(session);
      setMessages(session.conversationHistory || []);
      setSessionNotes(session.notes || "");
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && socketRef.current && selectedSession) {
      socketRef.current.emit("admin-message", {
        userId: selectedSession.userId,
        agentName: adminName,
        content: inputMessage,
      });
      setInputMessage("");

      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      socketRef.current.emit("admin-typing", {
        userId: selectedSession.userId,
        isTyping: false,
        agentName: adminName,
      });
    }
  };

  const handleTyping = (value: string) => {
    handleShortcutInput(value);

    if (socketRef.current && selectedSession) {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      socketRef.current.emit("admin-typing", {
        userId: selectedSession.userId,
        isTyping: true,
        agentName: adminName,
      });

      const timeout = setTimeout(() => {
        socketRef.current?.emit("admin-typing", {
          userId: selectedSession.userId,
          isTyping: false,
          agentName: adminName,
        });
      }, 2000);

      setTypingTimeout(timeout);
    }
  };

  const endSession = () => {
    if (socketRef.current && selectedSession) {
      socketRef.current.emit("end-session", { userId: selectedSession.userId });
      setSelectedSession(null);
      setMessages([]);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getSessionDuration = (joinedAt: string) => {
    const start = new Date(joinedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return "< 1 min";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMins = minutes % 60;
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
    }
    return `${minutes} min`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedSession) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/upload-file", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (data.success && socketRef.current) {
          socketRef.current.emit("admin-message", {
            userId: selectedSession.userId,
            agentName: adminName,
            content: `📎 Sent file: ${file.name}`,
            fileUrl: data.fileUrl,
            fileName: file.name,
          });
        }
      } catch (error) {
        console.error("File upload error:", error);
        alert("Failed to upload file.");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  if (isCheckingSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              Admin Live Chat
            </h1>
            <p className="text-gray-600 mt-2">Texas Premium Insurance</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    adminName.trim() &&
                    adminPassword === ADMIN_PASSWORD
                  ) {
                    loginAsAdmin(adminName);
                  }
                }}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      adminName.trim() &&
                      adminPassword === ADMIN_PASSWORD
                    ) {
                      loginAsAdmin(adminName);
                    }
                  }}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                if (adminName.trim() && adminPassword === ADMIN_PASSWORD) {
                  loginAsAdmin(adminName);
                } else if (adminPassword !== ADMIN_PASSWORD) {
                  alert("Incorrect password. Please try again.");
                }
              }}
              className="w-full bg-gradient-to-r from-red-700 to-blue-800 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Join as Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-blue-600 text-white rounded-lg shadow-lg"
      >
        <Menu className="w-6 h-6" />
      </button>

      <div
        className={`${
          showMobileSidebar ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:relative z-40 w-full sm:w-96 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 h-full`}
      >
        <div className="p-4 border-b bg-gradient-to-r from-red-700 to-blue-800 text-white flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Live Chats</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="lg:hidden p-1.5 hover:bg-white/20 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className="p-1.5 hover:bg-white/20 rounded transition"
                title={
                  notificationsEnabled
                    ? "Mute notifications"
                    : "Enable notifications"
                }
              >
                {notificationsEnabled ? (
                  <Bell className="w-4 h-4" />
                ) : (
                  <BellOff className="w-4 h-4" />
                )}
              </button>
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                }`}
              ></div>
              <span className="text-sm hidden sm:inline">
                {isConnected ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-100 truncate">
              Logged in as {adminName}
            </p>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs transition flex-shrink-0"
              title="Logout"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
          {totalChatsCount > 0 && (
            <p className="text-xs text-blue-200 mt-1">
              Showing {sessions.length} of {totalChatsCount} chats
            </p>
          )}
        </div>

        <div className="p-3 border-b bg-gray-50 space-y-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or ID..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <span className="capitalize">{filterStatus}</span>
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showFilterMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                  {["all", "active", "ended", "unassigned"].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setFilterStatus(status as typeof filterStatus);
                        setShowFilterMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition first:rounded-t-lg last:rounded-b-lg ${
                        filterStatus === status
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : ""
                      }`}
                    >
                      <span className="capitalize">{status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">
                {searchQuery || filterStatus !== "all"
                  ? "No matching chats"
                  : "No active chats"}
              </p>
              <p className="text-sm mt-2">
                {searchQuery || filterStatus !== "all"
                  ? "Try adjusting your filters"
                  : "Waiting for customers..."}
              </p>
            </div>
          ) : (
            <>
              {filteredSessions.map((session, sessionIndex) => {
                const isClaimedByMe =
                  session.hasAgent && session.agentName === adminName;
                const isClaimedByOther =
                  session.hasAgent && session.agentName !== adminName;
                const lastMessage =
                  session.conversationHistory[
                    session.conversationHistory.length - 1
                  ];
                const unreadCount = session.unreadCount || 0;

                return (
                  <div
                    key={`${session.userId}-${sessionIndex}`}
                    className={`w-full border-b relative group ${
                      selectedSession?.userId === session.userId
                        ? "bg-blue-50 border-l-4 border-l-blue-600"
                        : ""
                    } ${
                      isClaimedByOther &&
                      !session.customerEnded &&
                      !session.adminEnded
                        ? "opacity-50"
                        : ""
                    } ${session.customerEnded ? "bg-red-50" : ""} ${
                      session.adminEnded ? "bg-orange-50" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        claimCustomer(session);
                        setShowMobileSidebar(false);
                      }}
                      disabled={
                        isClaimedByOther &&
                        !session.customerEnded &&
                        !session.adminEnded
                      }
                      className="w-full p-4 text-left hover:bg-gray-50 transition disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0 pr-10">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 truncate">
                              {session.userName}
                            </p>
                            {unreadCount > 0 && (
                              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                                {unreadCount}
                              </span>
                            )}
                          </div>
                          {session.userPhone && (
                            <p className="text-xs text-gray-500 truncate">
                              {session.userPhone}
                            </p>
                          )}
                          {session.customerEnded && (
                            <span className="text-xs text-red-600 font-medium">
                              ● Customer ended chat
                            </span>
                          )}
                          {session.adminEnded && (
                            <span className="text-xs text-orange-600 font-medium">
                              ● Admin ended chat
                            </span>
                          )}
                          {!session.customerEnded &&
                            !session.adminEnded &&
                            isClaimedByMe && (
                              <span className="text-xs text-green-600 font-medium">
                                You&apos;re chatting
                              </span>
                            )}
                          {!session.customerEnded &&
                            !session.adminEnded &&
                            isClaimedByOther && (
                              <span className="text-xs text-orange-600 font-medium">
                                {session.agentName} is chatting
                              </span>
                            )}
                          {!session.customerEnded &&
                            !session.adminEnded &&
                            !session.hasAgent && (
                              <span className="text-xs text-blue-600 font-medium">
                                New chat
                              </span>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 pr-8">
                          {session.isActive && !session.customerEnded && (
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          )}
                          {session.customerEnded && (
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          )}
                          <div className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                            <Clock size={12} />
                            {getSessionDuration(session.joinedAt)}
                          </div>
                        </div>
                      </div>
                      {customerTyping[session.userId] ? (
                        <p className="text-sm text-blue-600 italic truncate">
                          {session.userName} is typing...
                        </p>
                      ) : lastMessage ? (
                        <p className="text-sm text-gray-600 truncate">
                          {lastMessage.isAdmin ? "You: " : ""}
                          {lastMessage.content}
                        </p>
                      ) : null}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(session.userId);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-100 rounded transition-opacity z-10"
                      title="Delete chat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {hasMoreChats && filterStatus === "all" && !searchQuery && (
                <button
                  onClick={loadMoreChats}
                  disabled={isLoadingMore}
                  className="w-full p-4 border-t bg-gray-50 hover:bg-gray-100 transition text-center text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading more chats...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Load More ({totalChatsCount - sessions.length} remaining)
                    </>
                  )}
                </button>
              )}

              {!hasMoreChats && sessions.length > 0 && loadedCount >= 20 && (
                <div className="w-full p-4 border-t bg-gray-50 text-center text-sm text-gray-500">
                  All chats loaded ({sessions.length} total)
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedSession ? (
          <>
            <div className="p-3 sm:p-4 bg-white border-b shadow-sm flex items-center justify-between flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base sm:text-lg text-gray-800 truncate">
                  {selectedSession.userName}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 truncate">
                  {selectedSession.userPhone &&
                    `${selectedSession.userPhone} • `}
                  User ID: {selectedSession.userId}
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowNotesModal(true)}
                  className="p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  title="Add notes"
                >
                  <StickyNote className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  onClick={downloadTranscript}
                  className="p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  title="Download transcript"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  onClick={() => deleteChat(selectedSession.userId)}
                  className="p-1.5 sm:p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                  title="Delete chat"
                >
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  onClick={endSession}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-1 sm:gap-2 text-sm"
                >
                  <X size={14} className="sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">End Chat</span>
                  <span className="sm:hidden">End</span>
                </button>
              </div>
            </div>

            {selectedSession.notes && (
              <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                <div className="flex items-start gap-2">
                  <StickyNote className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-yellow-800">
                      Internal Notes:
                    </p>
                    <p className="text-sm text-yellow-700 truncate">
                      {selectedSession.notes}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNotesModal(true)}
                    className="text-yellow-600 hover:text-yellow-800 text-xs"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 bg-gray-50">
              {messages.map((msg, index) => (
                <div
                  key={msg.id || `msg-${index}`}
                  className={`flex ${
                    msg.isAdmin ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 ${
                      msg.isAdmin
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-800 shadow"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <p
                        className={`text-xs font-semibold ${
                          msg.isAdmin ? "text-blue-100" : "text-gray-600"
                        }`}
                      >
                        {msg.isAdmin
                          ? msg.userName || adminName
                          : selectedSession.userName}
                      </p>
                      {msg.isAdmin && msg.read && (
                        <CheckCheck className="w-3 h-3 text-blue-200" />
                      )}
                    </div>
                    <p className="whitespace-pre-line text-sm sm:text-base">
                      {msg.content}
                    </p>
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
                    <p
                      className={`text-xs mt-1 ${
                        msg.isAdmin ? "text-blue-100" : "text-gray-500"
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}

              {selectedSession && customerTyping[selectedSession.userId] && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] sm:max-w-[70%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 bg-gray-100 border border-gray-200">
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
                        {selectedSession.userName} is typing...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showQuickResponses && (
              <div className="border-t bg-white p-3 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-600" />
                    <h4 className="text-sm font-semibold text-gray-800">
                      Quick Responses
                    </h4>
                    <span className="text-xs text-gray-500 hidden sm:inline">
                      (Type shortcuts like /greeting)
                    </span>
                  </div>
                  <button
                    onClick={() => setShowQuickResponses(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickResponses.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => insertQuickResponse(qr)}
                      className="text-left p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-blue-600">
                          {qr.shortcut}
                        </code>
                        <span className="text-xs text-gray-500">
                          {qr.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-2">
                        {qr.message}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 sm:p-4 bg-white border-t">
              {selectedSession.customerEnded || selectedSession.adminEnded ? (
                <div className="text-center py-3 text-gray-500 bg-gray-50 rounded-lg text-sm sm:text-base">
                  <p className="font-medium">
                    This chat session has ended - Read-only mode
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1 sm:gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 sm:p-2 text-gray-600 hover:text-gray-800 transition flex-shrink-0"
                      type="button"
                      title="Attach file"
                    >
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => setShowQuickResponses(!showQuickResponses)}
                      className={`p-1.5 sm:p-2 transition flex-shrink-0 ${
                        showQuickResponses
                          ? "text-yellow-600 bg-yellow-50"
                          : "text-gray-600 hover:text-gray-800"
                      }`}
                      type="button"
                      title="Quick responses"
                    >
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="p-1.5 sm:p-2 text-gray-600 hover:text-gray-800 transition"
                        type="button"
                        title="Add emoji"
                      >
                        <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-12 left-0 z-50">
                          <EmojiPicker
                            onEmojiClick={(emojiData) => {
                              handleTyping(inputMessage + emojiData.emoji);
                              setShowEmojiPicker(false);
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputMessage}
                      onChange={(e) => handleTyping(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          sendMessage(e);
                        }
                      }}
                      placeholder="Type message..."
                      className="flex-1 px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base min-w-0"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!inputMessage.trim()}
                      className="px-3 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 flex-shrink-0"
                    >
                      <Send size={16} className="sm:w-5 sm:h-5" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                  {inputMessage.startsWith("/") && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Shortcut detected - press Enter or click Quick Response
                      button above
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500 max-w-md p-4">
              <MessageSquare size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-xl font-semibold">No Chat Selected</p>
              <p className="mt-2">
                Select a customer from the sidebar to start chatting
              </p>
              <div className="mt-8 p-4 bg-blue-50 rounded-lg text-left">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Quick Response Shortcuts
                </h3>
                <div className="space-y-1 text-sm text-blue-800">
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/greeting</code>{" "}
                    - Welcome message
                  </p>
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/quote</code> -
                    Quote assistance
                  </p>
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/claim</code> -
                    Claim help
                  </p>
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/payment</code> -
                    Payment link
                  </p>
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/thanks</code> -
                    Thank you
                  </p>
                  <p>
                    <code className="bg-blue-100 px-1 rounded">/bye</code> -
                    Goodbye
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNotesModal && selectedSession && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-gray-800">
                  Internal Notes
                </h3>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Add notes for {selectedSession.userName} (visible only to admins)
            </p>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="Add internal notes about this conversation..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowNotesModal(false);
                  setSessionNotes(selectedSession.notes || "");
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveSessionNotes}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
