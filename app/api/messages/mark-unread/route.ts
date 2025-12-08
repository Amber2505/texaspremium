import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

// Type for stored message
interface StoredMessage {
  direction?: string;
}

// Type for conversation document
interface ConversationDocument {
  messages?: StoredMessage[];
}

export async function POST(request: NextRequest) {
  try {
    const body: { phoneNumber?: string; conversationId?: string } = await request.json();
    const { phoneNumber, conversationId } = body;
    
    // Use conversationId if provided, otherwise fall back to phoneNumber for backward compatibility
    const identifier = conversationId || phoneNumber;
    
    if (!identifier) {
      return NextResponse.json(
        { error: 'Conversation ID or phone number is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    // Find conversation by conversationId (preferred) or phoneNumber (backward compatibility)
    type QueryFilter = Record<string, unknown>;
    let query: QueryFilter;
    if (conversationId) {
      query = { conversationId: conversationId };
    } else {
      query = {
        $or: [
          { conversationId: phoneNumber },
          { phoneNumber: phoneNumber }
        ]
      };
    }
    
    // Get the conversation to count inbound messages
    const conversation = await conversationsCollection.findOne(query) as ConversationDocument | null;
    
    if (!conversation) {
      console.log(`⚠️ No conversation found for: ${identifier}`);
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    // Count inbound messages
    const inboundCount = (conversation.messages || []).filter(
      (m: StoredMessage) => m.direction === "Inbound"
    ).length;
    
    // Mark all inbound messages as unread and update unread count
    const result = await conversationsCollection.updateOne(
      query,
      {
        $set: {
          "messages.$[elem].readStatus": "Unread",
          unreadCount: inboundCount,
        },
      },
      {
        arrayFilters: [{ "elem.direction": "Inbound" }],
      }
    );
    
    console.log(`✅ Marked conversation as unread: ${identifier} (${inboundCount} inbound messages)`);
    
    return NextResponse.json({ 
      success: true,
      conversationId: identifier,
      messagesUpdated: result.modifiedCount,
      unreadCount: inboundCount,
    });
  } catch (error: unknown) {
    console.error('❌ Mark as unread error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to mark as unread' },
      { status: 500 }
    );
  }
}