import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

// Type for stored message
interface StoredMessage {
  id?: string;
  subject?: string;
  direction?: string;
  readStatus?: string;
}

// Type for conversation document
interface ConversationDocument {
  phoneNumber: string;
  conversationId?: string;
  participants?: string[];
  isGroup?: boolean;
  messages?: StoredMessage[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phoneNumber = searchParams.get('phoneNumber');
    const conversationId = searchParams.get('conversationId');
    const fetchAll = searchParams.get('all') === 'true';
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const limit = fetchAll ? 10000 : parseInt(searchParams.get('limit') || '10', 10);
    const searchText = searchParams.get('searchText') || ''; // For message content search
    
    if (!phoneNumber && !conversationId) {
      return NextResponse.json(
        { error: 'Phone number or conversation ID is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    console.log(`🔍 Fetching conversation - conversationId: ${conversationId || 'N/A'}, phone: ${phoneNumber || 'N/A'} (skip: ${skip}, limit: ${limit}, searchText: ${searchText || 'none'})`);
    
    // Find conversation by conversationId (preferred) or phoneNumber (backward compatibility)
    let conversation: ConversationDocument | null = null;
    if (conversationId) {
      conversation = await conversationsCollection.findOne({
        conversationId: conversationId,
      }) as ConversationDocument | null;
    } else if (phoneNumber) {
      // Try conversationId first (for single conversations, conversationId = phoneNumber)
      conversation = await conversationsCollection.findOne({
        conversationId: phoneNumber,
      }) as ConversationDocument | null;
      
      // Fallback to old phoneNumber field for backward compatibility
      if (!conversation) {
        conversation = await conversationsCollection.findOne({
          phoneNumber: phoneNumber,
        }) as ConversationDocument | null;
      }
    }
    
    if (!conversation) {
      console.log(`✅ No conversation found`);
      return NextResponse.json({
        messages: [],
        total: 0,
        skip,
        limit,
        hasMore: false,
        searchText,
        matchingIndices: [],
        conversationId: conversationId || phoneNumber,
        isGroup: false,
        participants: phoneNumber ? [phoneNumber] : [],
      });
    }
    
    const allMessages = conversation.messages || [];
    
    // **CRITICAL FIX: Deduplicate messages by ID before processing**
    const seenIds = new Set<string>();
    const uniqueMessages = allMessages.filter((msg: StoredMessage) => {
      if (!msg.id) return true; // Keep messages without IDs (shouldn't happen)
      if (seenIds.has(msg.id)) {
        console.log(`⚠️  Duplicate message found in DB: ${msg.id}, removing from response`);
        return false;
      }
      seenIds.add(msg.id);
      return true;
    });
    
    const total = uniqueMessages.length;
    const isGroup = conversation.isGroup || false;
    const participants = conversation.participants || (conversation.conversationId ? conversation.conversationId.split(',') : [phoneNumber || '']);
    
    console.log(`📊 Total messages after dedup: ${total} (removed ${allMessages.length - total} duplicates)`);
    console.log(`📊 Group: ${isGroup}, Participants: [${participants.join(', ')}]`);
    
    // If searching for text, find matching messages and return around them
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      
      // Find all matching message indices
      const matchingIndices: number[] = [];
      uniqueMessages.forEach((msg: StoredMessage, index: number) => {
        if (msg.subject && msg.subject.toLowerCase().includes(searchLower)) {
          matchingIndices.push(index);
        }
      });
      
      if (matchingIndices.length === 0) {
        // No matches, return last 10 messages as normal
        const startIndex = Math.max(0, total - limit);
        const messages = uniqueMessages.slice(startIndex, total);
        return NextResponse.json({
          messages,
          total,
          skip: 0,
          limit,
          hasMore: startIndex > 0,
          searchText,
          matchingIndices: [],
          firstMatchIndex: -1,
          conversationId: conversation.conversationId || phoneNumber,
          isGroup,
          participants,
        });
      }
      
      // Get the first match and load messages around it
      const firstMatchIndex = matchingIndices[0];
      
      // Load 5 messages before and after the first match (or more to get context)
      const contextBefore = 5;
      const contextAfter = 5;
      const startIndex = Math.max(0, firstMatchIndex - contextBefore);
      const endIndex = Math.min(total, firstMatchIndex + contextAfter + 1);
      
      const messages = uniqueMessages.slice(startIndex, endIndex);
      
      // Adjust matching indices relative to the returned slice
      const relativeMatchingIndices = matchingIndices
        .filter(idx => idx >= startIndex && idx < endIndex)
        .map(idx => idx - startIndex);
      
      console.log(`✅ Search "${searchText}": Found ${matchingIndices.length} matches, returning ${messages.length} messages (indices ${startIndex}-${endIndex})`);
      
      return NextResponse.json({
        messages,
        total,
        skip: startIndex,
        limit: messages.length,
        hasMore: startIndex > 0,
        hasMoreAfter: endIndex < total,
        searchText,
        matchingIndices: relativeMatchingIndices,
        firstMatchIndex: relativeMatchingIndices[0] || 0,
        absoluteFirstMatch: firstMatchIndex,
        conversationId: conversation.conversationId || phoneNumber,
        isGroup,
        participants,
      });
    }
    
    // If fetching all, return all messages
    if (fetchAll) {
      return NextResponse.json({
        messages: uniqueMessages,
        total,
        skip: 0,
        limit: total,
        hasMore: false,
        searchText: '',
        matchingIndices: [],
        conversationId: conversation.conversationId || phoneNumber,
        isGroup,
        participants,
      });
    }
    
    // Normal pagination: return newest messages first
    // skip=0 gets the last 10, skip=10 gets the 10 before that, etc.
    const startIndex = Math.max(0, total - skip - limit);
    const endIndex = total - skip;
    
    // Get the slice of messages (still in chronological order for display)
    const messages = uniqueMessages.slice(startIndex, endIndex);
    
    const hasMore = startIndex > 0;
    
    console.log(`✅ Returning ${messages.length} of ${total} messages (indices ${startIndex}-${endIndex}, hasMore: ${hasMore})`);
    
    return NextResponse.json({
      messages,
      total,
      skip,
      limit,
      hasMore,
      searchText: '',
      matchingIndices: [],
      conversationId: conversation.conversationId || phoneNumber,
      isGroup,
      participants,
    });
  } catch (error: unknown) {
    console.error('❌ Get conversation error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}