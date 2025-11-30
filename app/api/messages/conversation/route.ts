import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phoneNumber = searchParams.get('phoneNumber');
    
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    console.log(`🔍 Fetching conversation for: ${phoneNumber}`);
    
    // Find conversation by phone number
    const conversation = await conversationsCollection.findOne({
      phoneNumber: phoneNumber,
    });
    
    if (!conversation) {
      console.log(`✅ No conversation found for ${phoneNumber}`);
      return NextResponse.json({
        messages: [],
      });
    }
    
    const messages = conversation.messages || [];
    console.log(`✅ Found ${messages.length} messages for ${phoneNumber}`);
    
    return NextResponse.json({
      messages,
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