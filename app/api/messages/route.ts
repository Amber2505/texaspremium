// /api/messages/route.ts
// Updated to support server-side pagination, search, and GROUP CONVERSATIONS

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

// Type for stored message
interface StoredMessage {
  subject?: string;
}

// Type for conversation document from MongoDB
interface ConversationDocument {
  phoneNumber: string;
  conversationId?: string;
  participants?: string[];
  isGroup?: boolean;
  lastMessageTime: string;
  unreadCount?: number;
  messages?: StoredMessage[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const search = searchParams.get("search") || "";

    const client = await clientPromise;
    const db = client.db("db");
    const collection = db.collection("texas_premium_messages");

    // Build query - search by phone number OR message content if provided
    type QueryFilter = Record<string, unknown>;
    let query: QueryFilter = {};
    const matchingMessageIds: Map<string, string[]> = new Map(); // conversationId -> matching message snippets

    if (search.trim()) {
      const searchTerm = search.trim();
      const isPhoneSearch = /^\d+$/.test(searchTerm.replace(/[\s\-\(\)\+]/g, ""));

      if (isPhoneSearch) {
        // Pure phone number search - search in phoneNumber, conversationId, AND participants array
        const phoneRegex = { $regex: searchTerm.replace(/[\s\-\(\)\+]/g, ""), $options: "i" };
        query = {
          $or: [
            { phoneNumber: phoneRegex },
            { conversationId: phoneRegex },
            { participants: phoneRegex },
          ],
        };
      } else {
        // Search both phone numbers AND message content
        query = {
          $or: [
            { phoneNumber: { $regex: searchTerm, $options: "i" } },
            { conversationId: { $regex: searchTerm, $options: "i" } },
            { participants: { $regex: searchTerm, $options: "i" } },
            { "messages.subject": { $regex: searchTerm, $options: "i" } },
          ],
        };

        // Find conversations with matching messages to highlight them
        const matchingConvs = await collection
          .find({ "messages.subject": { $regex: searchTerm, $options: "i" } })
          .project({ phoneNumber: 1, conversationId: 1, messages: 1 })
          .toArray();

        for (const conv of matchingConvs) {
          const convDoc = conv as ConversationDocument;
          const matchingMsgs = (convDoc.messages || [])
            .filter((m: StoredMessage) => 
              m.subject && m.subject.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .slice(-3) // Get last 3 matching messages
            .map((m: StoredMessage) => m.subject || "");
          
          if (matchingMsgs.length > 0) {
            const key = convDoc.conversationId || convDoc.phoneNumber;
            matchingMessageIds.set(key, matchingMsgs);
          }
        }
      }
    }

    // Get total count for pagination info
    const total = await collection.countDocuments(query);

    // Fetch paginated conversations sorted by lastMessageTime descending
    const conversations = await collection
      .find(query)
      .sort({ lastMessageTime: -1 })
      .skip(skip)
      .limit(limit)
      .project({
        phoneNumber: 1,
        conversationId: 1,      // NEW: Unique conversation identifier
        participants: 1,        // NEW: Array of all participants
        isGroup: 1,             // NEW: Flag for group messages
        lastMessageTime: 1,
        unreadCount: 1,
        messages: { $slice: -1 }, // Only get the last message for preview
      })
      .toArray();

    // Transform to match expected format
    const formattedConversations = conversations
      .map((conv) => {
        const convDoc = conv as ConversationDocument;
        // For backward compatibility, use conversationId if available, otherwise phoneNumber
        const conversationId = convDoc.conversationId || convDoc.phoneNumber;
        const participants = convDoc.participants || [convDoc.phoneNumber];
        const isGroup = convDoc.isGroup || false;

        return {
          phoneNumber: convDoc.phoneNumber,
          conversationId,           // NEW: Unique identifier for the conversation
          participants,             // NEW: All participants in the conversation
          isGroup,                  // NEW: Whether this is a group conversation
          messageCount: convDoc.messages?.length || 0,
          lastMessage: convDoc.messages?.[0] || null,
          lastMessageTime: convDoc.lastMessageTime,
          unreadCount: convDoc.unreadCount || 0,
          // Include matching message snippets if this was a content search
          matchingMessages: matchingMessageIds.get(conversationId) || [],
        };
      })
      // CRITICAL: Filter out conversations with no messages
      .filter(conv => conv.messageCount > 0);

    return NextResponse.json({
      conversations: formattedConversations,
      total,
      skip,
      limit,
      hasMore: skip + formattedConversations.length < total,
      searchType: search.trim() ? (/^\d+$/.test(search.trim().replace(/[\s\-\(\)\+]/g, "")) ? "phone" : "content") : "none",
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}