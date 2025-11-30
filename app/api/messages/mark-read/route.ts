import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    console.log(`📖 Marking messages as read for: ${phoneNumber}`);
    
    // Update all inbound unread messages in the conversation
    const result = await conversationsCollection.updateOne(
      { phoneNumber: phoneNumber },
      {
        $set: {
          "messages.$[elem].readStatus": "Read",
          unreadCount: 0,
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        arrayFilters: [
          { 
            "elem.direction": "Inbound",
            "elem.readStatus": "Unread"
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any
      }
    );
    
    console.log(`✅ Marked messages as read (modified: ${result.modifiedCount})`);
    
    return NextResponse.json({
      success: true,
      updated: result.modifiedCount,
    });
  } catch (error: unknown) {
    console.error('❌ Mark as read error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}