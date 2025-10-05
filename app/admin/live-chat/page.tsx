"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Users, X, Clock } from "lucide-react";
import io from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

interface ChatMessage {
  id: string;
  content: string;
  isAdmin: boolean;
  timestamp: string;
  userName?: string;
}

interface ChatSession {
  userId: string;
  userName: string;
  socketId: string;
  joinedAt: string;
  isActive: boolean;
  hasAgent: boolean;
  agentName?: string;
  conversationHistory: ChatMessage[];
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      setIsConnected(true);
      socketRef.current?.emit("admin-join");
    });

    socketRef.current.on("active-sessions", (activeSessions: ChatSession[]) => {
      setSessions(activeSessions);
    });

    socketRef.current.on("customer-joined", (session: ChatSession) => {
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
      "customer-disconnected",
      ({ userId }: { userId: string }) => {
        setSessions((prev) =>
          prev.map((s) => (s.userId === userId ? { ...s, isActive: false } : s))
        );
      }
    );

    socketRef.current.on("session-ended", ({ userId }: { userId: string }) => {
      setSessions((prev) => prev.filter((s) => s.userId !== userId));
      if (selectedSession?.userId === userId) {
        setSelectedSession(null);
        setMessages([]);
      }
    });

    socketRef.current.on("disconnect", () => {
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

      const message: ChatMessage = {
        id: Date.now().toString(),
        content: inputMessage,
        isAdmin: true,
        timestamp: new Date().toISOString(),
        userName: adminName,
      };

      setMessages((prev) => [...prev, message]);
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
              if (adminName.trim()) {
                loginAsAdmin(adminName);
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
                />
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
            sessions.map((session) => {
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
                  key={session.userId}
                  onClick={() => {
                    if (!session.hasAgent || isClaimedByMe) {
                      claimCustomer(session);
                    }
                  }}
                  disabled={isClaimedByOther}
                  className={`w-full p-4 border-b text-left hover:bg-gray-50 transition ${
                    selectedSession?.userId === session.userId
                      ? "bg-blue-50 border-l-4 border-l-blue-600"
                      : ""
                  } ${isClaimedByOther ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">
                        {session.userName}
                      </p>
                      {isClaimedByMe && (
                        <span className="text-xs text-green-600 font-medium">
                          You&apos;re chatting
                        </span>
                      )}
                      {isClaimedByOther && (
                        <span className="text-xs text-orange-600 font-medium">
                          {session.agentName} is chatting
                        </span>
                      )}
                      {!session.hasAgent && (
                        <span className="text-xs text-blue-600 font-medium">
                          New chat
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {session.isActive && (
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
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
              {messages.map((msg) => (
                <div
                  key={msg.id}
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
                    {!msg.isAdmin && (
                      <p className="text-xs font-semibold text-gray-600 mb-1">
                        {selectedSession.userName}
                      </p>
                    )}
                    <p className="whitespace-pre-line">{msg.content}</p>
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
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t">
              <form onSubmit={sendMessage} className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => handleTyping(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
