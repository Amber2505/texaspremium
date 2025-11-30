// app/api/messages/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const { messageIds, phoneNumber } = await request.json();

    if (!messageIds?.length || !phoneNumber) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("texas_premium_messages");

    const result = await collection.updateOne(
      { phoneNumber },
      {
        $pull: {
          messages: { id: { $in: messageIds } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    );

    return NextResponse.json({
      success: true,
      deleted: result.modifiedCount > 0
    });

  } catch (error: unknown) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}