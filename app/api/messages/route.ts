// /api/messages/route.ts
// Updated to support server-side pagination and search (phone + message content)

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

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
    let query: Record<string, unknown> = {};
    const matchingMessageIds: Map<string, string[]> = new Map(); // phoneNumber -> matching message snippets

    if (search.trim()) {
      const searchTerm = search.trim();
      const isPhoneSearch = /^\d+$/.test(searchTerm.replace(/[\s\-\(\)\+]/g, ""));

      if (isPhoneSearch) {
        // Pure phone number search
        query.phoneNumber = { $regex: searchTerm.replace(/[\s\-\(\)\+]/g, ""), $options: "i" };
      } else {
        // Search both phone numbers AND message content
        query = {
          $or: [
            { phoneNumber: { $regex: searchTerm, $options: "i" } },
            { "messages.subject": { $regex: searchTerm, $options: "i" } },
          ],
        };

        // Find conversations with matching messages to highlight them
        const matchingConvs = await collection
          .find({ "messages.subject": { $regex: searchTerm, $options: "i" } })
          .project({ phoneNumber: 1, messages: 1 })
          .toArray();

        for (const conv of matchingConvs) {
          const matchingMsgs = (conv.messages || [])
            .filter((m: { subject?: string }) => 
              m.subject && m.subject.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .slice(-3) // Get last 3 matching messages
            .map((m: { subject?: string }) => m.subject || "");
          
          if (matchingMsgs.length > 0) {
            matchingMessageIds.set(conv.phoneNumber, matchingMsgs);
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
        lastMessageTime: 1,
        unreadCount: 1,
        messages: { $slice: -1 }, // Only get the last message for preview
      })
      .toArray();

    // Transform to match expected format
    const formattedConversations = conversations.map((conv) => ({
      phoneNumber: conv.phoneNumber,
      messageCount: conv.messages?.length || 0,
      lastMessage: conv.messages?.[0] || null,
      lastMessageTime: conv.lastMessageTime,
      unreadCount: conv.unreadCount || 0,
      // Include matching message snippets if this was a content search
      matchingMessages: matchingMessageIds.get(conv.phoneNumber) || [],
    }));

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