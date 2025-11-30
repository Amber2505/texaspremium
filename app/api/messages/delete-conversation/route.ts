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

    // Delete the entire conversation document
    const result = await conversationsCollection.deleteOne({ phoneNumber });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    console.log(`🗑️  Deleted conversation: ${phoneNumber}`);

    return NextResponse.json({ 
      success: true,
      deleted: true 
    });
  } catch (error) {
    console.error("❌ Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}