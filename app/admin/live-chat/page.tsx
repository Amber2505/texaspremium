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
} from "lucide-react";
import io from "socket.io-client";
import EmojiPicker from "emoji-picker-react";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "https://texaspremium-production.up.railway.app";

interface ChatMessage {
  id: string;
  content: string;
  isAdmin: boolean;
  timestamp: string;
  userName?: string;
  fileUrl?: string;
  fileName?: string;
}

interface ChatSession {
  userId: string;
  userName: string;
  userPhone?: string;
  socketId: string;
  joinedAt: string;
  isActive: boolean;
  hasAgent: boolean;
  agentName?: string;
  conversationHistory: ChatMessage[];
  customerEnded?: boolean;
  adminEnded?: boolean;
}

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

  const ADMIN_PASSWORD = "Insurance2024";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current
        .play()
        .catch((err) => console.log("Audio play failed:", err));
    }
  };

  const loginAsAdmin = (name: string) => {
    setAdminName(name);
    setIsLoggedIn(true);

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
    });

    socketRef.current.on("customer-joined", (session: ChatSession) => {
      console.log("Customer joined:", session);
      setSessions((prev) => [...prev, session]);
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
                }
              : session
          )
        );

        if (selectedSession?.userId === userId) {
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

    socketRef.current.on("session-updated", (updatedSession: ChatSession) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.userId === updatedSession.userId ? updatedSession : s
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
          prev.map((s) => (s.userId === userId ? { ...s, isActive: false } : s))
        );
      }
    );

    socketRef.current.on(
      "customer-ended-session",
      (data: { message: string; userId: string; userName: string }) => {
        console.log("🟢 ADMIN: RECEIVED customer-ended-session event");
        console.log("🟢 ADMIN: Data:", data);

        const { message, userId } = data;

        setSessions((prev) =>
          prev.map((s) =>
            s.userId === userId
              ? { ...s, isActive: false, customerEnded: true }
              : s
          )
        );

        if (selectedSession?.userId === userId) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              content: message,
              isAdmin: false,
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          setSessions((prev) =>
            prev.map((s) =>
              s.userId === userId
                ? {
                    ...s,
                    conversationHistory: [
                      ...s.conversationHistory,
                      {
                        id: Date.now().toString(),
                        content: message,
                        isAdmin: false,
                        timestamp: new Date().toISOString(),
                      },
                    ],
                  }
                : s
            )
          );
        }
      }
    );

    socketRef.current.on("session-ended", ({ userId }: { userId: string }) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.userId === userId ? { ...s, isActive: false, adminEnded: true } : s
        )
      );

      if (selectedSession?.userId === userId) {
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
      return;
    }

    if (socketRef.current && !session.hasAgent) {
      socketRef.current.emit("admin-claim-customer", {
        userId: session.userId,
        adminName,
      });

      setSelectedSession(session);
      setMessages(session.conversationHistory || []);
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
    setInputMessage(value);

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
      socketRef.current.emit("end-session", {
        userId: selectedSession.userId,
      });

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
    return minutes < 1 ? "< 1 min" : `${minutes} min`;
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

  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (adminName.trim() && adminPassword === ADMIN_PASSWORD) {
                loginAsAdmin(adminName);
              } else if (adminPassword !== ADMIN_PASSWORD) {
                alert("Incorrect password. Please try again.");
              }
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  suppressHydrationWarning
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
                    placeholder="Enter password"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
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
                type="submit"
                className="w-full bg-gradient-to-r from-red-700 to-blue-800 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
              >
                Join as Admin
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b bg-gradient-to-r from-red-700 to-blue-800 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Live Chats</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                }`}
              ></div>
              <span className="text-sm">
                {isConnected ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <p className="text-sm text-blue-100">Logged in as {adminName}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">No active chats</p>
              <p className="text-sm mt-2">Waiting for customers...</p>
            </div>
          ) : (
            sessions.map((session, sessionIndex) => {
              const isClaimedByMe =
                session.hasAgent && session.agentName === adminName;
              const isClaimedByOther =
                session.hasAgent && session.agentName !== adminName;
              const lastMessage =
                session.conversationHistory[
                  session.conversationHistory.length - 1
                ];

              return (
                <button
                  key={`${session.userId}-${sessionIndex}`}
                  onClick={() => {
                    if (session.customerEnded || session.adminEnded) {
                      setSelectedSession(session);
                      setMessages(session.conversationHistory || []);
                    } else if (!session.hasAgent || isClaimedByMe) {
                      claimCustomer(session);
                    }
                  }}
                  disabled={
                    isClaimedByOther &&
                    !session.customerEnded &&
                    !session.adminEnded
                  }
                  className={`w-full p-4 border-b text-left hover:bg-gray-50 transition ${
                    selectedSession?.userId === session.userId
                      ? "bg-blue-50 border-l-4 border-l-blue-600"
                      : ""
                  } ${
                    isClaimedByOther &&
                    !session.customerEnded &&
                    !session.adminEnded
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                    ${session.customerEnded ? "bg-red-50" : ""}
                    ${session.adminEnded ? "bg-orange-50" : ""}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">
                        {session.userName}
                      </p>
                      {session.userPhone && (
                        <p className="text-xs text-gray-500">
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
                    <div className="flex flex-col items-end gap-1">
                      {session.isActive && !session.customerEnded && (
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      )}
                      {session.customerEnded && (
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock size={12} />
                        {getSessionDuration(session.joinedAt)}
                      </div>
                    </div>
                  </div>
                  {lastMessage && (
                    <p className="text-sm text-gray-600 truncate">
                      {lastMessage.isAdmin ? "You: " : ""}
                      {lastMessage.content}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedSession ? (
          <>
            <div className="p-4 bg-white border-b shadow-sm flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg text-gray-800">
                  {selectedSession.userName}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedSession.userPhone &&
                    `${selectedSession.userPhone} • `}
                  User ID: {selectedSession.userId}
                </p>
              </div>
              <button
                onClick={endSession}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2"
              >
                <X size={16} />
                End Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {messages.map((msg, index) => (
                <div
                  key={msg.id || `msg-${index}`}
                  className={`flex ${
                    msg.isAdmin ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 ${
                      msg.isAdmin
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-800 shadow"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold mb-1 ${
                        msg.isAdmin ? "text-blue-100" : "text-gray-600"
                      }`}
                    >
                      {msg.isAdmin
                        ? msg.userName || adminName
                        : selectedSession.userName}
                    </p>

                    <p className="whitespace-pre-line">{msg.content}</p>
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
                  <div className="max-w-[70%] rounded-lg px-4 py-3 bg-gray-100 border border-gray-200">
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

            <div className="p-4 bg-white border-t">
              {selectedSession.customerEnded || selectedSession.adminEnded ? (
                <div className="text-center py-3 text-gray-500 bg-gray-50 rounded-lg">
                  <p className="font-medium">
                    This chat session has ended - Read-only mode
                  </p>
                </div>
              ) : (
                <form onSubmit={sendMessage} className="flex gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-600 hover:text-gray-800 transition"
                    type="button"
                    aria-label="Attach file"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <div className="relative">
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
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    suppressHydrationWarning
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send size={20} />
                    Send
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500">
              <Users size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-xl font-semibold">No Chat Selected</p>
              <p className="mt-2">
                Select a customer from the sidebar to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
