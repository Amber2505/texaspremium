import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

// Type for MongoDB filter
interface ConversationFilter {
  phoneNumber?: { $regex: string; $options: string };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const phoneNumber = searchParams.get('phoneNumber');
    
    // KEY FIX: If limit is not provided, default to 0 (meaning fetch ALL)
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 0;
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    console.log("📊 Fetching conversations from db.texas_premium_messages...");
    
    // Build filter
    const filter: ConversationFilter = {};
    if (phoneNumber) {
      filter.phoneNumber = { $regex: phoneNumber, $options: 'i' };
    }
    
    // Get total count
    const total = await conversationsCollection.countDocuments(filter);
    console.log(`📈 Total conversations in DB: ${total}`);
    
    let conversations;
    
    // KEY FIX: If limit is 0, fetch ALL conversations (no pagination)
    if (limit === 0) {
      conversations = await conversationsCollection
        .find(filter)
        .sort({ lastMessageTime: -1 })
        .toArray();
      console.log(`📦 Fetching ALL ${total} conversations (no limit)`);
    } else {
      // Use pagination with specified limit
      const skip = (page - 1) * limit;
      conversations = await conversationsCollection
        .find(filter)
        .sort({ lastMessageTime: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      console.log(`📦 Fetching page ${page} with limit ${limit}`);
    }
    
    // Format for frontend
    const formattedConversations = conversations.map(conv => {
      const messages = conv.messages || [];
      const lastMessage = messages[messages.length - 1] || {};
      
      return {
        phoneNumber: conv.phoneNumber,
        messageCount: messages.length,
        lastMessage: {
          id: lastMessage.id || '',
          direction: lastMessage.direction || 'Inbound',
          subject: lastMessage.subject || '',
          creationTime: lastMessage.creationTime || conv.lastMessageTime,
          readStatus: lastMessage.readStatus || 'Read',
          attachments: lastMessage.attachments || [],
        },
        lastMessageTime: conv.lastMessageTime,
        unreadCount: conv.unreadCount || 0,
      };
    });
    
    console.log(`✅ Returning ${formattedConversations.length} conversations`);
    
    return NextResponse.json({
      conversations: formattedConversations,
      pagination: {
        page,
        limit: limit || total,
        total,
        pages: limit ? Math.ceil(total / limit) : 1,
      },
    });
  } catch (error: unknown) {
    console.error('❌ Get messages error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}