import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("schedule_message_storage");

    const scheduled = await collection
      .find({})
      .sort({ scheduledAt: 1 })
      .toArray();

    return NextResponse.json({ success: true, scheduled });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, phoneNumbers, message, scheduledAt } = body;

    if (!conversationId || !phoneNumbers?.length || !message || !scheduledAt) {
      return NextResponse.json(
        { error: "conversationId, phoneNumbers, message, and scheduledAt are required" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }

    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: "scheduledAt must be in the future" },
        { status: 400 }
      );
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("schedule_message_storage");

    const doc = {
      conversationId,
      phoneNumbers,
      message,
      scheduledAt: scheduledDate,
      status: "pending",
      createdAt: new Date(),
      sentAt: null,
      failedAt: null,
      error: null,
      messageId: null,
      processingStartedAt: null,
    };

    const result = await collection.insertOne(doc);

    console.log(`📅 Scheduled message created: ${result.insertedId} for ${scheduledDate.toISOString()}`);

    return NextResponse.json({
      success: true,
      id: result.insertedId,
      scheduledAt: scheduledDate,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("schedule_message_storage");

    const { ObjectId } = await import("mongodb");

    const result = await collection.deleteOne({
      _id: new ObjectId(id),
      status: "pending",
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Scheduled message not found or already sent" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, scheduledAt, message } = body;

    if (!id || !scheduledAt) {
    return NextResponse.json({ error: "id and scheduledAt are required" }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("schedule_message_storage");
    const { ObjectId } = await import("mongodb");

    const updateFields: Record<string, unknown> = { scheduledAt: scheduledDate };
    if (message && message.trim()) {
    updateFields.message = message.trim();
    }

    const result = await collection.updateOne(
    { _id: new ObjectId(id), status: "pending" },
    { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Scheduled message not found or already sent" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, scheduledAt: scheduledDate });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}