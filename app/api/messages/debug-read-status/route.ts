import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

async function getRingCentralClient() {
  const rcsdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  return platform;
}

interface UnreadMessage {
  id: string;
  subject: string;
  creationTime: string;
}

interface UnreadConversation {
  phoneNumber: string;
  unreadCount: number;
  unreadMessages: UnreadMessage[];
}

interface RCStatusCheck {
  id: string;
  readStatus?: string;
  subject?: string;
  error?: string;
}

interface RCMatch {
  id: number | string;
  subject?: string;
  readStatus?: string;
}

// Type for message from MongoDB
interface StoredMessage {
  id?: string;
  direction?: string;
  readStatus?: string;
  subject?: string;
  creationTime?: string;
}

// DEBUG ENDPOINT - Use this to see what's happening
export async function GET() {
  try {
    console.log("🐛 DEBUG: Starting read status check...");
    
    const platform = await getRingCentralClient();
    
    // Import MongoDB
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    // Get all conversations from MongoDB
    const allConversations = await conversationsCollection.find({}).toArray();
    console.log(`📊 Total conversations in MongoDB: ${allConversations.length}`);

    // Collect all unread messages
    const unreadConversations: UnreadConversation[] = [];
    
    for (const conv of allConversations) {
      const messages: StoredMessage[] = conv.messages || [];
      const unread = messages.filter(
        (m: StoredMessage) => m.direction === "Inbound" && m.readStatus === "Unread" && m.id
      );
      
      if (unread.length > 0) {
        unreadConversations.push({
          phoneNumber: conv.phoneNumber,
          unreadCount: conv.unreadCount || 0,
          unreadMessages: unread.map((m: StoredMessage) => ({
            id: m.id?.toString() || '',
            subject: (m.subject || "").substring(0, 30),
            creationTime: m.creationTime || '',
          })),
        });
      }
    }

    console.log(`📬 Found ${unreadConversations.length} conversations with unread messages`);
    console.log("Unread conversations:", JSON.stringify(unreadConversations, null, 2));

    // Get all message IDs
    const messageIds: string[] = [];
    for (const conv of unreadConversations) {
      for (const msg of conv.unreadMessages) {
        messageIds.push(msg.id);
      }
    }

    console.log(`🔍 Checking ${messageIds.length} message IDs in RingCentral...`);

    // Check each message individually in RingCentral
    const rcStatus: RCStatusCheck[] = [];
    for (const msgId of messageIds) {
      try {
        const response = await platform.get(
          `/restapi/v1.0/account/~/extension/~/message-store/${msgId}`
        );
        const msg = await response.json();
        rcStatus.push({
          id: msgId,
          readStatus: msg.readStatus,
          subject: (msg.subject || "").substring(0, 30),
        });
        console.log(`  Message ${msgId}: ${msg.readStatus}`);
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(`  ❌ Failed to check message ${msgId}:`, err.message);
        rcStatus.push({
          id: msgId,
          error: "Failed to fetch",
        });
      }
    }

    // Also fetch all Read messages from RingCentral
    console.log("📥 Fetching all Read messages from RingCentral...");
    const readResponse = await platform.get(
      "/restapi/v1.0/account/~/extension/~/message-store",
      {
        messageType: "SMS",
        readStatus: "Read",
        perPage: 100,
      }
    );
    const readMessagesData = await readResponse.json();
    const readMessages: RCMatch[] = readMessagesData.records || [];
    console.log(`📩 Found ${readMessages.length} Read messages in RingCentral`);

    // Check for matches
    const matches: RCMatch[] = readMessages.filter((rcMsg: RCMatch) =>
      messageIds.includes(rcMsg.id.toString())
    );
    console.log(`✅ ${matches.length} of our unread messages are actually Read in RingCentral`);

    return NextResponse.json({
      debug: true,
      mongoDbConversations: allConversations.length,
      unreadInMongo: unreadConversations.length,
      unreadMessageIds: messageIds,
      rcReadMessagesTotal: readMessages.length,
      rcStatusChecks: rcStatus,
      matchesFound: matches.length,
      matches: matches.map((m: RCMatch) => ({
        id: m.id.toString(),
        subject: (m.subject || "").substring(0, 30),
        readStatus: m.readStatus,
      })),
      details: {
        unreadConversations: unreadConversations,
        shouldBeUpdated: matches.map((m: RCMatch) => m.id.toString()),
      },
    });
  } catch (error: unknown) {
    console.error("❌ Debug error:", error);
    const err = error as { message?: string; stack?: string };
    return NextResponse.json(
      { 
        error: err.message,
        stack: err.stack 
      },
      { status: 500 }
    );
  }
}