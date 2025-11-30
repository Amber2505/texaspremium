import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phoneNumber = searchParams.get('phoneNumber');
    const fetchAll = searchParams.get('all') === 'true';
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const limit = fetchAll ? 10000 : parseInt(searchParams.get('limit') || '10', 10);
    
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    console.log(`🔍 Fetching conversation for: ${phoneNumber} (skip: ${skip}, limit: ${limit}, all: ${fetchAll})`);
    
    // Find conversation by phone number
    const conversation = await conversationsCollection.findOne({
      phoneNumber: phoneNumber,
    });
    
    if (!conversation) {
      console.log(`✅ No conversation found for ${phoneNumber}`);
      return NextResponse.json({
        messages: [],
        total: 0,
        skip,
        limit,
        hasMore: false,
      });
    }
    
    const allMessages = conversation.messages || [];
    const total = allMessages.length;
    
    // If fetching all, return all messages
    if (fetchAll) {
      return NextResponse.json({
        messages: allMessages,
        total,
        skip: 0,
        limit: total,
        hasMore: false,
      });
    }
    
    // Messages are stored oldest to newest
    // We want to return newest first for pagination
    // So we slice from the end: skip=0 gets the last 25, skip=25 gets the 25 before that, etc.
    const startIndex = Math.max(0, total - skip - limit);
    const endIndex = total - skip;
    
    // Get the slice of messages (still in chronological order for display)
    const messages = allMessages.slice(startIndex, endIndex);
    
    const hasMore = startIndex > 0;
    
    console.log(`✅ Returning ${messages.length} of ${total} messages (indices ${startIndex}-${endIndex})`);
    
    return NextResponse.json({
      messages,
      total,
      skip,
      limit,
      hasMore,
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