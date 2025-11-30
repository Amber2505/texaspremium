// /api/messages/route.ts
// Updated to support server-side pagination and search

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

    // Build query - search by phone number if provided
    const query: Record<string, unknown> = {};
    if (search.trim()) {
      // Search for phone numbers containing the search string
      query.phoneNumber = { $regex: search.trim(), $options: "i" };
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
    }));

    return NextResponse.json({
      conversations: formattedConversations,
      total,
      skip,
      limit,
      hasMore: skip + formattedConversations.length < total,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}