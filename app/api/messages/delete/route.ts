import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

// Type for stored message
interface StoredMessage {
  id?: string;
  direction?: string;
  readStatus?: string;
}

// Type for conversation document
interface ConversationDocument {
  messages?: StoredMessage[];
  unreadCount?: number;
  conversationId?: string;
  phoneNumber?: string;
}

// Update operator type for deleting messages
type PullMessagesUpdate = {
  $pull: {
    messages: {
      id: { $in: string[] }
    }
  }
};

export async function POST(request: NextRequest) {
  try {
    const body: { 
      messageIds?: string[]; 
      phoneNumber?: string; 
      conversationId?: string;
    } = await request.json();

    const { messageIds, phoneNumber, conversationId } = body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: 'Message IDs are required' },
        { status: 400 }
      );
    }

    // Prefer conversationId (new), fallback to phoneNumber (old)
    const identifier = conversationId || phoneNumber;

    if (!identifier) {
      return NextResponse.json(
        { error: 'Conversation ID or phone number is required' },
        { status: 400 }
      );
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection<ConversationDocument>("texas_premium_messages");

    // Build query filter
    type QueryFilter = Record<string, unknown>;
    let query: QueryFilter;

    if (conversationId) {
      query = { conversationId };
    } else {
      query = {
        $or: [
          { conversationId: phoneNumber },
          { phoneNumber }
        ]
      };
    }

    // Typed update operator (no any)
    const updateQuery: PullMessagesUpdate = {
      $pull: {
        messages: {
          id: { $in: messageIds }
        }
      }
    };

    const result = await conversationsCollection.updateOne(query, updateQuery);

    if (result.matchedCount === 0) {
      console.log(`⚠️ No conversation found for: ${identifier}`);
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Deleted ${messageIds.length} messages from conversation: ${identifier}`);

    // Fetch updated conversation
    const updatedConv = await conversationsCollection.findOne(query);

    if (updatedConv && updatedConv.messages) {
      const unreadCount = updatedConv.messages.filter(
        (m: StoredMessage) =>
          m.direction === "Inbound" && m.readStatus === "Unread"
      ).length;

      // Update unread count
      await conversationsCollection.updateOne(
        query,
        { $set: { unreadCount } }
      );
    }

    return NextResponse.json({
      success: true,
      conversationId: identifier,
      deletedCount: messageIds.length,
    });

  } catch (error: unknown) {
    console.error('❌ Delete messages error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to delete messages' },
      { status: 500 }
    );
  }
}
