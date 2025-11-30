import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    // Mark all messages in this conversation as Unread
    const result = await conversationsCollection.updateOne(
      { phoneNumber },
      { 
        $set: { 
          "messages.$[].readStatus": "Unread",
          unreadCount: { $size: "$messages" } // Set unread count to total messages
        } 
      }
    );

    // Also update unreadCount by counting messages
    const conversation = await conversationsCollection.findOne({ phoneNumber });
    if (conversation && conversation.messages) {
      await conversationsCollection.updateOne(
        { phoneNumber },
        { $set: { unreadCount: conversation.messages.length } }
      );
    }

    console.log(`📬 Marked conversation as unread: ${phoneNumber}`);

    return NextResponse.json({ 
      success: true,
      updated: result.modifiedCount > 0 
    });
  } catch (error) {
    console.error("❌ Error marking as unread:", error);
    return NextResponse.json(
      { error: "Failed to mark as unread" },
      { status: 500 }
    );
  }
}