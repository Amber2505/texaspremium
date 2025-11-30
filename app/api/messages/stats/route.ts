import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    // Get total conversation count
    const totalConversations = await conversationsCollection.countDocuments();
    
    // Get total message count by aggregating messages arrays
    const pipeline = [
      {
        $project: {
          messageCount: { $size: { $ifNull: ["$messages", []] } }
        }
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: "$messageCount" }
        }
      }
    ];
    
    const result = await conversationsCollection.aggregate(pipeline).toArray();
    const totalMessages = result[0]?.totalMessages || 0;
    
    return NextResponse.json({
      totalMessages,
      totalConversations,
    });
  } catch (error: unknown) {
    console.error('❌ Get stats error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}