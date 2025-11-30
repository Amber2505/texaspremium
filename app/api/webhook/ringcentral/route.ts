// app/api/webhook/ringcentral/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { RingCentralMessage } from "@/lib/models/message";

export const dynamic = "force-dynamic"; // Important: no caching

// Validation token for RingCentral (you set this in the webhook setup)
const VALIDATION_TOKEN = process.env.RINGCENTRAL_WEBHOOK_TOKEN || "your-secret-token-here";

// Your Railway live chat server URL (must be HTTPS)
const RAILWAY_NOTIFY_URL = process.env.RAILWAY_NOTIFY_URL;

// Type for RingCentral webhook phone number recipient
interface RingCentralRecipient {
  phoneNumber?: string;
  extensionNumber?: string;
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("validation-token");
  if (token === VALIDATION_TOKEN) {
    return new Response(VALIDATION_TOKEN, {
      status: 200,
      headers: { "Validation-Token": VALIDATION_TOKEN },
    });
  }
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // RingCentral sends an array of events
    for (const event of body) {
      if (event.eventType !== "/restapi/v1.0/account/~/extension/~/message-store") continue;

      const msgData = event.body;
      if (!msgData || msgData.direction !== "Inbound") continue;

      // Prevent duplicates
      const client = await connectToDatabase;
      const db = client.db();
      const existing = await db
        .collection<RingCentralMessage>("messages")
        .findOne({ id: msgData.id.toString() });

      if (existing) {
        console.log("Duplicate message skipped:", msgData.id);
        continue;
      }

      const newMessage: RingCentralMessage = {
        id: msgData.id.toString(),
        uri: msgData.uri || "",
        conversationId: msgData.conversation?.id?.toString() || msgData.id.toString(),
        from: {
          phoneNumber: msgData.from?.phoneNumber || msgData.from?.extensionNumber || "Unknown",
        },
        to: msgData.to?.map((t: RingCentralRecipient) => ({ phoneNumber: t.phoneNumber || "" })) || [],
        direction: "Inbound",
        type: msgData.type || "SMS",
        subject: msgData.subject || "",
        creationTime: new Date(msgData.creationTime).toISOString(),
        lastModifiedTime: new Date(msgData.lastModifiedTime).toISOString(),
        readStatus: msgData.readStatus || "Unread",
        messageStatus: msgData.messageStatus || "Received",
        attachments: msgData.attachments || [],
      };

      // Save to MongoDB
      await db.collection<RingCentralMessage>("messages").insertOne(newMessage);
      console.log("Incoming message saved:", newMessage.from.phoneNumber, newMessage.subject);

      // NOTIFY RAILWAY LIVE CHAT SERVER (Real-time broadcast)
      if (RAILWAY_NOTIFY_URL) {
        try {
          await fetch(`${RAILWAY_NOTIFY_URL}/notify/ringcentral`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Optional: Add auth header if your Railway server requires it
              // "Authorization": `Bearer ${process.env.RAILWAY_NOTIFY_SECRET}`,
            },
            body: JSON.stringify({
              phoneNumber: newMessage.from.phoneNumber,
              messageId: newMessage.id,
              timestamp: newMessage.creationTime,
              subject: newMessage.subject?.slice(0, 50), // optional preview
            }),
          });
          console.log(`Real-time notification sent to Railway for ${newMessage.from.phoneNumber}`);
        } catch (notifyError) {
          console.error("Failed to notify Railway server:", notifyError);
          // Don't fail the webhook — message is already saved
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}