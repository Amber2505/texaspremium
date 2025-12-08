import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

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
    
    // Mark all inbound messages as read and reset unread count
    const result = await conversationsCollection.updateOne(
      query,
      {
        $set: {
          "messages.$[elem].readStatus": "Read",
          unreadCount: 0,
        },
      },
      {
        arrayFilters: [{ "elem.direction": "Inbound" }],
      }
    );
    
    if (result.matchedCount === 0) {
      console.log(`⚠️ No conversation found for: ${identifier}`);
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    console.log(`✅ Marked conversation as read: ${identifier} (${result.modifiedCount} messages updated)`);
    
    return NextResponse.json({ 
      success: true,
      conversationId: identifier,
      messagesUpdated: result.modifiedCount,
    });
  } catch (error: unknown) {
    console.error('❌ Mark as read error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to mark as read' },
      { status: 500 }
    );
  }
}