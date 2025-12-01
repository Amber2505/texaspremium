"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RingCentralMessage } from "@/lib/models/message";
import Image from "next/image";

interface ConversationSummary {
  phoneNumber: string;
  messageCount: number;
  lastMessage: RingCentralMessage;
  lastMessageTime: string;
  unreadCount?: number;
}

// Type for stored message filtering
interface StoredMessage {
  id?: string;
  direction?: string;
  readStatus?: string;
}

// Type for attachment
interface MessageAttachment {
  id?: string;
  uri?: string;
  azureUrl?: string;
  type?: string;
  contentType?: string;
  filename?: string;
}

export default function MessageStoredPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [conversation, setConversation] = useState<RingCentralMessage[]>([]);
  const [mounted, setMounted] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // Delete features
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set()
  );
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );

  // Image lightbox state
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    filename: string;
    allImages: Array<{ url: string; filename: string }>;
    currentIndex: number;
  } | null>(null);

  // Server-side pagination state
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const conversationsListRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Message pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [messagesSkip, setMessagesSkip] = useState(0);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Memoize scrollToBottom to use in useEffect dependencies
  const scrollToBottom = useCallback(() => {
    if (shouldScrollToBottom)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [shouldScrollToBottom]);

  // Lightbox functions - memoized for useEffect dependency
  const closeLightbox = useCallback(() => setLightboxImage(null), []);

  const navigateLightbox = useCallback((direction: "prev" | "next") => {
    setLightboxImage((current) => {
      if (!current) return null;
      const newIndex =
        direction === "prev"
          ? current.currentIndex - 1
          : current.currentIndex + 1;
      if (newIndex >= 0 && newIndex < current.allImages.length) {
        const newImage = current.allImages[newIndex];
        return {
          ...current,
          url: newImage.url,
          filename: newImage.filename,
          currentIndex: newIndex,
        };
      }
      return current;
    });
  }, []);

  // Back to conversations (for mobile)
  const handleBack = useCallback(() => {
    setSelectedPhone(null);
    setSelectMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  useEffect(() => setMounted(true), []);

  // Authentication check - redirect to /admin if not logged in
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

    // Check every minute
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mounted) fetchMessages(0, "", false);
  }, [mounted]);

  // Polling for new messages (only refresh if not searching and on first page)
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      // Only auto-refresh if not searching
      if (!searchInput.trim()) {
        fetch("/api/messages?skip=0&limit=25")
          .then((r) => r.json())
          .then((data) => {
            const newConversations = data.conversations || [];
            // Only update if there are changes
            if (newConversations.length > 0) {
              setConversations((prev) => {
                // Create a map of existing conversations by phone number
                const existingMap = new Map(
                  prev.map((c) => [c.phoneNumber, c])
                );

                // Update/add new conversations
                newConversations.forEach((conv: ConversationSummary) => {
                  existingMap.set(conv.phoneNumber, conv);
                });

                // Convert back to array and sort by lastMessageTime
                return Array.from(existingMap.values()).sort(
                  (a, b) =>
                    new Date(b.lastMessageTime).getTime() -
                    new Date(a.lastMessageTime).getTime()
                );
              });
              setTotalCount(data.total || newConversations.length);
            }
          });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [mounted, searchInput]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation, scrollToBottom]);

  useEffect(() => {
    const handler = () => openDropdown && setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShouldScrollToBottom(scrollHeight - scrollTop - clientHeight < 100);
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [selectedPhone]);

  // Load older messages when scrolling to top
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !selectedPhone) return;

    const handleScroll = () => {
      if (isLoadingMoreMessages || !hasMoreMessages) return;
      // Trigger when scrolled near the top (within 100px)
      if (container.scrollTop < 100) {
        loadMoreMessages();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [selectedPhone, isLoadingMoreMessages, hasMoreMessages, messagesSkip]);

  useEffect(() => {
    if (!selectedPhone) return;

    const ws = new WebSocket(process.env.NEXT_PUBLIC_RAILWAY_WS_URL!);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          room: `conversation:${selectedPhone}`,
        })
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "newRingCentralMessage") {
        // Fetch latest messages and merge with existing
        fetch(
          `/api/messages/conversation?phoneNumber=${encodeURIComponent(
            selectedPhone
          )}&skip=0&limit=10`
        )
          .then((r) => r.json())
          .then((d) => {
            const newMessages = d.messages || [];
            // Merge: keep older messages that aren't in the new batch
            setConversation((prev) => {
              const newMessageIds = new Set(
                newMessages.map((m: StoredMessage) => m.id)
              );
              const olderMessages = prev.filter(
                (m) => !newMessageIds.has(m.id)
              );
              return [...olderMessages, ...newMessages];
            });
            scrollToBottom();
          });
      }
    };

    return () => ws.close();
  }, [selectedPhone, scrollToBottom]);

  // Server-side infinite scroll
  useEffect(() => {
    const element = conversationsListRef.current;
    if (!element) return;

    const handleScroll = () => {
      if (isLoadingMore || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = element;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom) {
        fetchMessages(conversations.length, searchInput, true);
      }
    };

    element.addEventListener("scroll", handleScroll);
    return () => element.removeEventListener("scroll", handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingMore, hasMore, conversations.length, searchInput]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navigateLightbox("prev");
      if (e.key === "ArrowRight") navigateLightbox("next");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage, closeLightbox, navigateLightbox]);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const fetchMessages = async (skip = 0, search = "", append = false) => {
    if (skip === 0 && !append) setLoading(true);
    else setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: "25",
      });
      if (search.trim()) {
        params.append("search", search.trim());
      }

      const res = await fetch(`/api/messages?${params}`);
      const data = await res.json();

      const newConversations = data.conversations || [];
      const total = data.total || newConversations.length;

      if (append) {
        setConversations((prev) => {
          // Deduplicate: only add conversations that don't already exist
          const existingPhones = new Set(prev.map((c) => c.phoneNumber));
          const uniqueNew = newConversations.filter(
            (c: ConversationSummary) => !existingPhones.has(c.phoneNumber)
          );
          return [...prev, ...uniqueNew];
        });
      } else {
        setConversations(newConversations);
      }

      setTotalCount(total);
      setHasMore(skip + newConversations.length < total);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      setIsInitialLoad(false);
    }
  };

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchInput(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setConversations([]);
      setHasMore(true);
      fetchMessages(0, value, false);
    }, 300);
  };

  const viewConversation = async (phoneNumber: string) => {
    setSelectedPhone(phoneNumber);
    setMessageInput("");
    setShouldScrollToBottom(true);
    setSelectMode(false);
    setSelectedMessageIds(new Set());
    setIsLoadingConversation(true);
    setConversation([]);
    setMessagesSkip(0);
    setHasMoreMessages(true);

    try {
      const res = await fetch(
        `/api/messages/conversation?phoneNumber=${encodeURIComponent(
          phoneNumber
        )}&skip=0&limit=10`
      );
      const data = await res.json();
      setConversation(data.messages || []);
      setHasMoreMessages(data.hasMore || false);
      setMessagesSkip(data.messages?.length || 0);

      await markAsRead(phoneNumber);

      const unreadIds = (data.messages || [])
        .filter(
          (m: StoredMessage) =>
            m.direction === "Inbound" && m.readStatus === "Unread" && m.id
        )
        .map((m: StoredMessage) => m.id);

      if (unreadIds.length > 0) {
        await fetch("/api/messages/mark-read-ringcentral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: unreadIds }),
        });
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.phoneNumber === phoneNumber ? { ...c, unreadCount: 0 } : c
        )
      );

      setTimeout(scrollToBottom, 100);
    } catch {
      alert("Failed to load conversation");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  // Load older messages when scrolling up
  const loadMoreMessages = async () => {
    if (!selectedPhone || isLoadingMoreMessages || !hasMoreMessages) return;

    setIsLoadingMoreMessages(true);

    // Save scroll position before loading
    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      const res = await fetch(
        `/api/messages/conversation?phoneNumber=${encodeURIComponent(
          selectedPhone
        )}&skip=${messagesSkip}&limit=10`
      );
      const data = await res.json();
      const olderMessages = data.messages || [];

      if (olderMessages.length > 0) {
        // Prepend older messages to the conversation
        setConversation((prev) => [...olderMessages, ...prev]);
        setMessagesSkip((prev) => prev + olderMessages.length);
        setHasMoreMessages(data.hasMore || false);

        // Restore scroll position after DOM updates
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight;
          }
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      console.error("Failed to load more messages");
    } finally {
      setIsLoadingMoreMessages(false);
    }
  };

  const markAsRead = async (phoneNumber: string) => {
    try {
      await fetch("/api/messages/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
    } catch {
      // Error handled silently
    }
  };

  const markAsUnread = async (phoneNumber: string) => {
    try {
      const response = await fetch(
        `/api/messages/conversation?phoneNumber=${encodeURIComponent(
          phoneNumber
        )}&all=true`
      );
      const data = await response.json();

      const inboundMessageIds = (data.messages || [])
        .filter((m: StoredMessage) => m.direction === "Inbound" && m.id)
        .map((m: StoredMessage) => m.id);

      console.log(
        `📬 Marking ${inboundMessageIds.length} messages as unread on RingCentral...`
      );

      if (inboundMessageIds.length > 0) {
        await fetch("/api/messages/mark-unread-ringcentral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: inboundMessageIds }),
        });
      }

      await fetch("/api/messages/mark-unread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.phoneNumber === phoneNumber) {
            const messageCount = conv.messageCount || 1;
            return { ...conv, unreadCount: messageCount };
          }
          return conv;
        })
      );

      setOpenDropdown(null);

      console.log(`✅ Marked conversation as unread (RingCentral + local)`);
    } catch (error) {
      console.error("Failed to mark as unread:", error);
      alert("Failed to mark as unread");
    }
  };

  const deleteConversation = async (phoneNumber: string) => {
    if (
      !confirm(
        `Delete entire conversation with ${formatPhoneNumber(phoneNumber)}?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/messages/delete-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      if (!response.ok) throw new Error("Failed to delete conversation");

      setConversations((prev) =>
        prev.filter((conv) => conv.phoneNumber !== phoneNumber)
      );

      if (selectedPhone === phoneNumber) {
        setSelectedPhone(null);
        setConversation([]);
      }

      setOpenDropdown(null);
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert("Failed to delete conversation");
    }
  };

  const startNewConversation = () => {
    const cleaned = newPhoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10) return alert("Please enter a valid phone number");

    const formatted = cleaned.startsWith("1") ? `+${cleaned}` : `+1${cleaned}`;
    const existing = conversations.find((c) => c.phoneNumber === formatted);

    setShowNewMessageModal(false);
    setNewPhoneNumber("");

    if (existing) {
      viewConversation(formatted);
    } else {
      setSelectedPhone(formatted);
      setConversation([]);
      setMessageInput("");
      setSelectedFiles([]);
    }
  };

  const sendMessage = async () => {
    if (
      !selectedPhone ||
      (!messageInput.trim() && selectedFiles.length === 0) ||
      sending
    )
      return;

    const text = messageInput.trim();
    setMessageInput("");
    const filesToSend = [...selectedFiles];
    setSelectedFiles([]);
    setSending(true);

    try {
      const hasFiles = filesToSend.length > 0;
      const now = new Date().toISOString();

      const tempAttachments = filesToSend.map((file) => ({
        id: `local-${Date.now()}-${Math.random()}`,
        type: "MMS",
        filename: file.name,
        contentType: file.type,
        azureUrl: URL.createObjectURL(file),
        uri: URL.createObjectURL(file),
      }));

      const optimisticMsg: RingCentralMessage = {
        id: `optimistic-${Date.now()}`,
        direction: "Outbound",
        type: hasFiles ? "MMS" : "SMS",
        subject:
          text || (hasFiles ? `Sent ${filesToSend.length} attachment(s)` : ""),
        creationTime: now,
        lastModifiedTime: now,
        from: { phoneNumber: "+14697295185" },
        to: [{ phoneNumber: selectedPhone }],
        readStatus: "Read",
        messageStatus: "Sending",
        attachments: tempAttachments as RingCentralMessage["attachments"],
        uri: "",
        conversationId: "",
      };

      setConversation((prev) => [...prev, optimisticMsg]);
      setShouldScrollToBottom(true);

      setConversations((prev) =>
        prev.map((c) =>
          c.phoneNumber === selectedPhone
            ? {
                ...c,
                lastMessageTime: now,
                lastMessage: {
                  ...optimisticMsg,
                  subject: text || "Attachment",
                },
              }
            : c
        )
      );

      const formData = new FormData();
      formData.append("to", selectedPhone);
      formData.append("message", text);
      filesToSend.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/send", {
        method: "POST",
        body: hasFiles
          ? formData
          : JSON.stringify({ to: selectedPhone, message: text }),
        headers: hasFiles ? {} : { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Send failed");

      tempAttachments.forEach((a) => {
        if (a.azureUrl?.startsWith("blob:")) URL.revokeObjectURL(a.azureUrl);
        if (a.uri?.startsWith("blob:")) URL.revokeObjectURL(a.uri);
      });
    } catch {
      alert("Failed to send");
      setMessageInput(text);
      setSelectedFiles(filesToSend);
      setConversation((prev) =>
        prev.filter((m) => !m.id?.startsWith("optimistic-"))
      );
    } finally {
      setSending(false);
    }
  };

  const deleteMessages = async (ids: string[]) => {
    if (!selectedPhone || ids.length === 0) return;
    try {
      const res = await fetch("/api/messages/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: ids, phoneNumber: selectedPhone }),
      });
      if (!res.ok) throw new Error();
      setConversation((prev) => prev.filter((m) => !ids.includes(m.id!)));
      setSelectedMessageIds(new Set());
      setSelectMode(false);
    } catch {
      alert("Delete failed");
    }
  };

  const toggleSelect = (id: string) => {
    const set = new Set(selectedMessageIds);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    setSelectedMessageIds(set);
  };

  const startLongPress = (id: string) => {
    if (longPressTimer) clearTimeout(longPressTimer);
    const timer = setTimeout(() => {
      setSelectMode(true);
      setSelectedMessageIds(new Set([id]));
    }, 600);
    setLongPressTimer(timer);
  };

  const clearLongPress = () => longPressTimer && clearTimeout(longPressTimer);

  const formatPhoneNumber = (p: string) => {
    const c = p.replace(/\D/g, "");
    return c.length === 11 && c.startsWith("1")
      ? `+1 (${c.slice(1, 4)}) ${c.slice(4, 7)}-${c.slice(7)}`
      : p;
  };

  // Lightbox open function
  const openLightbox = (
    url: string,
    filename: string,
    allImages: Array<{ url: string; filename: string }>
  ) => {
    const currentIndex = allImages.findIndex((img) => img.url === url);
    setLightboxImage({ url, filename, allImages, currentIndex });
  };

  // Proper download function
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(url, "_blank");
    }
  };

  if (!mounted || isInitialLoad)
    return (
      <div className="h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading messages...</p>
        </div>
      </div>
    );

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header - Only show on conversation list view on mobile */}
      <div
        className={`bg-white border-b border-gray-200 px-4 sm:px-6 py-4 ${
          selectedPhone ? "hidden md:block" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Messages
          </h1>
          <Image
            src="/logo1.png"
            alt="Texas Premium Insurance Services"
            width={160}
            height={50}
            className="h-10 w-auto object-contain hidden sm:block"
          />
          <button
            onClick={() => setShowNewMessageModal(true)}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="hidden sm:inline">New Message</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Hide on mobile when conversation is selected */}
        <div
          className={`w-full md:w-96 bg-white border-r border-gray-200 flex flex-col ${
            selectedPhone ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by phone number..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="w-5 h-5 text-gray-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setConversations([]);
                    setHasMore(true);
                    fetchMessages(0, "", false);
                  }}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Conversations list with infinite scroll */}
          <div className="flex-1 overflow-y-auto" ref={conversationsListRef}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              /* Server-side paginated conversations */
              conversations.map((conv, index) => {
                const isSelected = selectedPhone === conv.phoneNumber;
                const lastMsg = conv.lastMessage;
                const isUnread =
                  (conv.unreadCount ?? 0) > 0 ||
                  (lastMsg?.direction === "Inbound" &&
                    lastMsg?.readStatus === "Unread");

                return (
                  <div
                    key={`${conv.phoneNumber}-${index}`}
                    className={`p-4 border-b border-gray-100 transition-colors relative ${
                      isSelected
                        ? "bg-blue-50 border-l-4 border-l-blue-600"
                        : "hover:bg-gray-50 active:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        onClick={() => viewConversation(conv.phoneNumber)}
                        className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center cursor-pointer"
                      >
                        <svg
                          className="w-8 h-8 text-white"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      </div>

                      <div
                        onClick={() => viewConversation(conv.phoneNumber)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h3
                            className={`${
                              isUnread ? "font-bold" : "font-semibold"
                            } text-gray-900 text-sm sm:text-base`}
                          >
                            {formatPhoneNumber(conv.phoneNumber)}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {new Date(
                                conv.lastMessageTime
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isUnread && (
                              <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm"></div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 truncate flex items-center gap-1">
                          {lastMsg?.direction === "Outbound" && (
                            <svg
                              className="w-4 h-4 text-gray-400 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                          {lastMsg?.subject || "No message"}
                        </p>
                      </div>

                      <div className="relative flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdown(
                              openDropdown === conv.phoneNumber
                                ? null
                                : conv.phoneNumber
                            );
                          }}
                          className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          <svg
                            className="w-5 h-5 text-gray-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {openDropdown === conv.phoneNumber && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsUnread(conv.phoneNumber);
                              }}
                              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b border-gray-100"
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
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                              Mark as Unread
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(conv.phoneNumber);
                              }}
                              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-b-lg"
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              Delete Conversation
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {/* Loading indicator for infinite scroll */}
            {(isLoadingMore || hasMore) && conversations.length > 0 && (
              <div className="flex items-center justify-center p-4 text-gray-500">
                <div className="flex items-center gap-2">
                  {isLoadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm">Loading more...</span>
                    </>
                  ) : hasMore ? (
                    <span className="text-sm text-gray-400">
                      {conversations.length} of {totalCount} conversations
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area - Show full screen on mobile when conversation is selected */}
        <div
          className={`flex-1 flex flex-col bg-gray-50 ${
            selectedPhone ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedPhone ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <svg
                className="w-24 h-24 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-xl font-medium">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Chat Header with Back Button - STICKY */}
              <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Back Button - More prominent on mobile */}
                    <button
                      onClick={handleBack}
                      className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-1 text-gray-600"
                    >
                      <svg
                        className="w-6 h-6"
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
                      <span className="text-sm font-medium md:hidden">
                        Back
                      </span>
                    </button>

                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-6 h-6 sm:w-8 sm:h-8 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                    <h2 className="font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[150px] sm:max-w-none">
                      {formatPhoneNumber(selectedPhone)}
                    </h2>
                  </div>

                  {selectMode ? (
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="text-xs sm:text-sm text-gray-600">
                        {selectedMessageIds.size}
                      </span>
                      <button
                        onClick={() =>
                          deleteMessages(Array.from(selectedMessageIds))
                        }
                        className="text-red-600 font-medium text-sm sm:text-base"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => {
                          setSelectMode(false);
                          setSelectedMessageIds(new Set());
                        }}
                        className="text-gray-500 text-sm sm:text-base"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-gray-500 hover:text-gray-700 text-sm sm:text-base p-2"
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4"
              >
                {/* Loading indicator for older messages */}
                {(isLoadingMoreMessages || hasMoreMessages) &&
                  conversation.length > 0 && (
                    <div className="flex items-center justify-center py-4">
                      {isLoadingMoreMessages ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                          <span className="text-sm text-gray-500">
                            Loading older messages...
                          </span>
                        </div>
                      ) : hasMoreMessages ? (
                        <span className="text-sm text-gray-400">
                          Scroll up for older messages
                        </span>
                      ) : null}
                    </div>
                  )}

                {/* Loading state when first viewing conversation */}
                {isLoadingConversation && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg
                          className="w-6 h-6 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </div>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                      <p className="text-gray-500 mt-3 text-sm">
                        Loading messages...
                      </p>
                    </div>
                  </div>
                )}

                {/* Empty state when no messages */}
                {!isLoadingConversation && conversation.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-3 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <p className="text-sm">No messages yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Start a conversation!
                      </p>
                    </div>
                  </div>
                )}

                {conversation.map((msg, index) => {
                  const isOutbound = msg.direction === "Outbound";
                  const showDate =
                    index === 0 ||
                    new Date(msg.creationTime).toDateString() !==
                      new Date(
                        conversation[index - 1]?.creationTime || ""
                      ).toDateString();
                  const isSelected = selectedMessageIds.has(msg.id || "");

                  return (
                    <div key={`${msg.id}-${index}`}>
                      {showDate && (
                        <div className="flex items-center justify-center my-4">
                          <div className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                            {new Date(msg.creationTime).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </div>
                        </div>
                      )}

                      <div
                        className={`flex ${
                          isOutbound ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div className="flex items-start gap-2 sm:gap-3 max-w-[85%] sm:max-w-[75%]">
                          {selectMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(msg.id || "")}
                              className="mt-4 w-5 h-5 text-blue-600 bg-white border-2 border-gray-400 rounded focus:ring-2 focus:ring-blue-500 z-10 flex-shrink-0 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}

                          <div
                            className={`relative rounded-2xl px-3 sm:px-4 py-2 transition-all ${
                              selectMode
                                ? isSelected
                                  ? "bg-blue-600 text-white ring-2 ring-blue-400"
                                  : "bg-gray-200 opacity-80 hover:opacity-100"
                                : isOutbound
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-900 border border-gray-200"
                            } ${selectMode ? "cursor-pointer" : ""}`}
                            onClick={() =>
                              selectMode && toggleSelect(msg.id || "")
                            }
                            onMouseDown={() =>
                              !selectMode && startLongPress(msg.id || "")
                            }
                            onMouseUp={clearLongPress}
                            onTouchStart={() =>
                              !selectMode && startLongPress(msg.id || "")
                            }
                            onTouchEnd={clearLongPress}
                          >
                            {selectMode && isSelected && (
                              <div className="absolute inset-0 rounded-2xl ring-4 ring-blue-400 pointer-events-none opacity-30" />
                            )}

                            {msg.subject && (
                              <p className="break-words whitespace-pre-wrap mb-2 text-sm sm:text-base">
                                {msg.subject}
                              </p>
                            )}

                            {/* Attachments */}
                            {msg.attachments?.length ? (
                              <div className="space-y-2 mt-2">
                                {msg.attachments.map(
                                  (att: MessageAttachment, i: number) => {
                                    const url = att.azureUrl || att.uri;
                                    if (!url) return null;

                                    if (att.contentType?.startsWith("image/")) {
                                      // Collect all images for lightbox navigation
                                      const allImages = conversation.flatMap(
                                        (m) =>
                                          (m.attachments || [])
                                            .filter(
                                              (a: MessageAttachment) =>
                                                a.contentType?.startsWith(
                                                  "image/"
                                                ) &&
                                                (a.azureUrl || a.uri)
                                            )
                                            .map((a: MessageAttachment) => ({
                                              url: a.azureUrl || a.uri || "",
                                              filename: a.filename || "image",
                                            }))
                                      );

                                      return (
                                        <div key={i} className="relative group">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={url}
                                            alt={att.filename || "Image"}
                                            className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                            style={{ maxHeight: "250px" }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openLightbox(
                                                url,
                                                att.filename || "image",
                                                allImages
                                              );
                                            }}
                                            title="Click to view full size"
                                          />
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              downloadFile(
                                                url,
                                                att.filename || "image.png"
                                              );
                                            }}
                                            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Download image"
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
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      );
                                    }

                                    if (att.contentType?.startsWith("audio/")) {
                                      return (
                                        <div
                                          key={i}
                                          className={`flex items-center justify-between gap-2 p-2 rounded ${
                                            isOutbound || isSelected
                                              ? "bg-blue-700 hover:bg-blue-800"
                                              : "bg-gray-100 hover:bg-gray-200"
                                          }`}
                                        >
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 flex-1"
                                          >
                                            <svg
                                              className="w-5 h-5 flex-shrink-0"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                                            </svg>
                                            <span className="text-sm truncate">
                                              {att.filename || "Audio"}
                                            </span>
                                          </a>
                                          <button
                                            onClick={() =>
                                              downloadFile(
                                                url,
                                                att.filename || "audio.mp3"
                                              )
                                            }
                                            className={`p-1 rounded hover:bg-opacity-80 ${
                                              isOutbound || isSelected
                                                ? "hover:bg-blue-600"
                                                : "hover:bg-gray-300"
                                            }`}
                                            title="Download audio"
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
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      );
                                    }

                                    if (att.contentType?.startsWith("video/")) {
                                      return (
                                        <div
                                          key={i}
                                          className={`flex items-center justify-between gap-2 p-2 rounded ${
                                            isOutbound || isSelected
                                              ? "bg-blue-700 hover:bg-blue-800"
                                              : "bg-gray-100 hover:bg-gray-200"
                                          }`}
                                        >
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 flex-1"
                                          >
                                            <svg
                                              className="w-5 h-5 flex-shrink-0"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                            </svg>
                                            <span className="text-sm truncate">
                                              {att.filename || "Video"}
                                            </span>
                                          </a>
                                          <button
                                            onClick={() =>
                                              downloadFile(
                                                url,
                                                att.filename || "video.mp4"
                                              )
                                            }
                                            className={`p-1 rounded hover:bg-opacity-80 ${
                                              isOutbound || isSelected
                                                ? "hover:bg-blue-600"
                                                : "hover:bg-gray-300"
                                            }`}
                                            title="Download video"
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
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      );
                                    }

                                    if (att.contentType === "application/pdf") {
                                      return (
                                        <div
                                          key={i}
                                          className={`flex items-center justify-between gap-2 p-2 rounded ${
                                            isOutbound || isSelected
                                              ? "bg-blue-700 hover:bg-blue-800"
                                              : "bg-gray-100 hover:bg-gray-200"
                                          }`}
                                        >
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 flex-1"
                                          >
                                            <svg
                                              className="w-5 h-5 flex-shrink-0"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                            <span className="text-sm truncate">
                                              {att.filename || "PDF Document"}
                                            </span>
                                          </a>
                                          <button
                                            onClick={() =>
                                              downloadFile(
                                                url,
                                                att.filename || "document.pdf"
                                              )
                                            }
                                            className={`p-1 rounded hover:bg-opacity-80 ${
                                              isOutbound || isSelected
                                                ? "hover:bg-blue-600"
                                                : "hover:bg-gray-300"
                                            }`}
                                            title="Download PDF"
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
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      );
                                    }

                                    return null;
                                  }
                                )}
                              </div>
                            ) : null}

                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className={`text-xs ${
                                  isOutbound || isSelected
                                    ? "text-blue-100"
                                    : "text-gray-500"
                                } opacity-70`}
                              >
                                {new Date(msg.creationTime).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" }
                                )}
                              </span>
                              {isOutbound && (
                                <svg
                                  className="w-4 h-4 text-blue-200"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!selectMode && (
                <div className="bg-white border-t border-gray-200 p-2 sm:p-4 safe-area-bottom">
                  {selectedFiles.length > 0 && (
                    <div className="mb-2 sm:mb-3 flex flex-wrap gap-2">
                      {selectedFiles.map((file, i) => {
                        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                        const isLarge = file.size > 1.5 * 1024 * 1024;
                        const isWarning = file.size > 1.2 * 1024 * 1024;

                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-2 rounded-lg text-sm ${
                              isLarge
                                ? "bg-red-100 border border-red-300"
                                : isWarning
                                ? "bg-yellow-100 border border-yellow-300"
                                : "bg-gray-100"
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="text-xs sm:text-sm font-medium truncate max-w-[100px] sm:max-w-none">
                                {file.name}
                              </span>
                              <span
                                className={`text-xs ${
                                  isLarge
                                    ? "text-red-600 font-semibold"
                                    : isWarning
                                    ? "text-yellow-700"
                                    : "text-gray-500"
                                }`}
                              >
                                {sizeMB}MB {isLarge && "⚠️"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                setSelectedFiles((prev) =>
                                  prev.filter((_, j) => j !== i)
                                )
                              }
                              className="text-red-600 hover:text-red-800 p-1"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 sm:gap-3 items-end">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 sm:px-3 sm:py-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl flex-shrink-0"
                    >
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const MAX_FILE_SIZE = 1.5 * 1024 * 1024;
                        const validFiles: File[] = [];

                        files.forEach((f) => {
                          const isValidType =
                            f.type.startsWith("image/") ||
                            f.type.startsWith("audio/") ||
                            f.type.startsWith("video/");

                          if (!isValidType) {
                            alert(
                              `❌ ${f.name}\n\nFile type not supported.\n\nMMS supports: Images, Audio, and Video files only.`
                            );
                            return;
                          }

                          if (f.size > MAX_FILE_SIZE) {
                            const sizeMB = (f.size / 1024 / 1024).toFixed(2);
                            alert(
                              `❌ ${f.name} is too large!\n\nFile size: ${sizeMB}MB\nMMS limit: 1.5MB\n\nPlease compress the file or choose a smaller one.`
                            );
                            return;
                          }

                          validFiles.push(f);
                        });

                        setSelectedFiles((prev) => [...prev, ...validFiles]);
                      }}
                      accept="image/*,audio/*,video/*"
                      multiple
                      className="hidden"
                    />

                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base"
                      disabled={sending}
                    />

                    <button
                      onClick={sendMessage}
                      className={`p-2 sm:px-6 sm:py-3 rounded-xl font-medium transition-all flex items-center justify-center flex-shrink-0 ${
                        (messageInput.trim() || selectedFiles.length > 0) &&
                        !sending
                          ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                      disabled={
                        (!messageInput.trim() && selectedFiles.length === 0) ||
                        sending
                      }
                    >
                      {sending ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5 sm:hidden"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                          </svg>
                          <span className="hidden sm:inline">Send</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-4 sm:p-6 shadow-2xl border border-gray-200">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
              New Message
            </h3>
            <input
              type="tel"
              value={newPhoneNumber}
              onChange={(e) => setNewPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startNewConversation()}
              placeholder="+19727486404"
              className="w-full px-4 py-3 border rounded-lg mb-4 text-base"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewMessageModal(false);
                  setNewPhoneNumber("");
                }}
                className="flex-1 py-3 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={startNewConversation}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <div
            className="relative max-w-7xl max-h-screen p-2 sm:p-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-2 sm:top-4 right-2 sm:right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 z-10"
              title="Close (Esc)"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <button
              onClick={() =>
                downloadFile(lightboxImage.url, lightboxImage.filename)
              }
              className="absolute top-2 sm:top-4 right-14 sm:right-20 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 z-10"
              title="Download"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>

            {lightboxImage.currentIndex > 0 && (
              <button
                onClick={() => navigateLightbox("prev")}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 sm:p-3 z-10"
                title="Previous (←)"
              >
                <svg
                  className="w-6 h-6 sm:w-8 sm:h-8"
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
              </button>
            )}

            {lightboxImage.currentIndex <
              lightboxImage.allImages.length - 1 && (
              <button
                onClick={() => navigateLightbox("next")}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 sm:p-3 z-10"
                title="Next (→)"
              >
                <svg
                  className="w-6 h-6 sm:w-8 sm:h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}

            <div className="flex items-center justify-center h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.filename}
                className="max-w-full max-h-[85vh] sm:max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {lightboxImage.allImages.length > 1 && (
              <div className="absolute bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded-full text-sm">
                {lightboxImage.currentIndex + 1} /{" "}
                {lightboxImage.allImages.length}
              </div>
            )}

            <div className="absolute bottom-4 sm:bottom-20 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded-full text-xs sm:text-sm max-w-[80%] sm:max-w-md truncate">
              {lightboxImage.filename}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
