// app/api/messages/debug-rc/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

// Type definitions for RingCentral messages
interface RCAttachment {
  id?: string;
  contentType?: string;
  type?: string;
  uri?: string;
}

interface RCMessage {
  id: string;
  type?: string;
  direction?: string;
  subject?: string;
  from?: { phoneNumber?: string };
  to?: Array<{ phoneNumber?: string }>;
  creationTime?: string;
  readStatus?: string;
  attachments?: RCAttachment[];
}

interface DebugResults {
  timestamp: string;
  specificMessage?: Record<string, unknown>;
  specificMessageError?: string;
  messages?: {
    totalCount: number;
    withAttachments: number;
    withoutAttachments: number;
    all: Array<Record<string, unknown>>;
  };
  summary?: {
    totalMessages: number;
    messagesWithAttachments: number;
    messagesWithoutAttachments: number;
    phoneFilter: string;
  };
}

async function getRingCentralClient() {
  const rcsdk = new SDK({
    server: "https://platform.ringcentral.com",
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  return platform;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get("messageId");
    const phoneNumber = searchParams.get("phoneNumber");
    
    const platform = await getRingCentralClient();
    
    const results: DebugResults = {
      timestamp: new Date().toISOString(),
    };

    // If messageId provided, fetch that specific message
    if (messageId) {
      console.log(`🔍 Fetching message ${messageId} from RingCentral...`);
      
      try {
        const msgResponse = await platform.get(
          `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`
        );
        const msgData = await msgResponse.json() as RCMessage;
        
        results.specificMessage = {
          id: msgData.id,
          type: msgData.type,
          direction: msgData.direction,
          subject: msgData.subject,
          from: msgData.from,
          to: msgData.to,
          creationTime: msgData.creationTime,
          readStatus: msgData.readStatus,
          attachments: msgData.attachments || [],
          attachmentCount: msgData.attachments?.length || 0,
          rawAttachments: JSON.stringify(msgData.attachments, null, 2),
        };
      } catch (err: unknown) {
        results.specificMessageError = err instanceof Error ? err.message : "Unknown error";
      }
    }

    // Fetch recent messages (last 24 hours) to see what's there
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Fetch SMS/MMS messages (MMS comes through as SMS type with attachments)
    const messagesResponse = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 50,
    });
    const messagesData = await messagesResponse.json() as { records?: RCMessage[] };

    // Filter by phone number if provided
    let allRecords: RCMessage[] = messagesData.records || [];
    
    if (phoneNumber) {
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      allRecords = allRecords.filter((msg: RCMessage) => {
        const fromPhone = msg.from?.phoneNumber?.replace(/\D/g, '') || '';
        const toPhone = msg.to?.[0]?.phoneNumber?.replace(/\D/g, '') || '';
        return fromPhone.includes(normalizedPhone) || toPhone.includes(normalizedPhone);
      });
    }

    // Separate messages with and without attachments
    const messagesWithAttachments = allRecords.filter((m: RCMessage) => m.attachments && m.attachments.length > 0);
    const messagesWithoutAttachments = allRecords.filter((m: RCMessage) => !m.attachments || m.attachments.length === 0);

    results.messages = {
      totalCount: allRecords.length,
      withAttachments: messagesWithAttachments.length,
      withoutAttachments: messagesWithoutAttachments.length,
      all: allRecords.map((msg: RCMessage) => ({
        id: msg.id,
        type: msg.type,
        direction: msg.direction,
        subject: msg.subject?.substring(0, 100) || "(empty)",
        from: msg.from?.phoneNumber,
        to: msg.to?.[0]?.phoneNumber,
        creationTime: msg.creationTime,
        attachmentCount: msg.attachments?.length || 0,
        attachments: msg.attachments?.map((att: RCAttachment) => ({
          id: att.id,
          contentType: att.contentType,
          type: att.type,
          uri: att.uri,
        })) || [],
      })),
    };

    // Summary
    results.summary = {
      totalMessages: allRecords.length,
      messagesWithAttachments: messagesWithAttachments.length,
      messagesWithoutAttachments: messagesWithoutAttachments.length,
      phoneFilter: phoneNumber || "none",
    };

    console.log("📊 Debug results:", JSON.stringify(results.summary, null, 2));

    return NextResponse.json(results);
  } catch (error: unknown) {
    console.error("❌ Debug error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}