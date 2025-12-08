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
    
    // Find and delete conversation by conversationId (preferred) or phoneNumber (backward compatibility)
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
    
    const result = await conversationsCollection.deleteOne(query);
    
    if (result.deletedCount === 0) {
      console.log(`⚠️ No conversation found to delete: ${identifier}`);
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    console.log(`✅ Deleted conversation: ${identifier}`);
    
    return NextResponse.json({ 
      success: true,
      conversationId: identifier,
      deleted: true,
    });
  } catch (error: unknown) {
    console.error('❌ Delete conversation error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}