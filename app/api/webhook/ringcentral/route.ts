// app/api/webhook/ringcentral/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

const VALIDATION_TOKEN = process.env.RINGCENTRAL_WEBHOOK_TOKEN || "";
const RAILWAY_NOTIFY_URL = process.env.RAILWAY_NOTIFY_URL;

// Type definitions
interface ProcessedAttachment {
  id: string;
  filename: string;
  contentType: string;
  azureUrl: string;
  uri: string;
  type: string;
}

interface ToRecipient {
  phoneNumber?: string;
}

// Initialize RingCentral SDK for attachment downloads
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

    for (const event of body) {
      if (event.eventType !== "/restapi/v1.0/account/~/extension/~/message-store") continue;

      const msgData = event.body;
      if (!msgData || msgData.direction !== "Inbound") continue;

      const client = await connectToDatabase;
      const db = client.db("db");
      
      // Use texas_premium_messages collection (conversation-based structure)
      const conversationsCollection = db.collection("texas_premium_messages");

      const phoneNumber = msgData.from?.phoneNumber || "Unknown";
      const messageId = msgData.id?.toString() || Date.now().toString();

      // Check if this message already exists in the conversation
      const existingConversation = await conversationsCollection.findOne({
        phoneNumber: phoneNumber,
        "messages.id": messageId,
      });

      if (existingConversation) {
        console.log("⏭️ Duplicate message skipped:", messageId);
        continue;
      }

      // === PROCESS ATTACHMENTS ===
      const processedAttachments: ProcessedAttachment[] = [];

      if (msgData.attachments && msgData.attachments.length > 0) {
        console.log(`📎 Processing ${msgData.attachments.length} inbound attachment(s) from ${phoneNumber}...`);

        try {
          // Get authenticated RingCentral client
          const platform = await getRingCentralClient();
          const authData = await platform.auth().data();
          const authToken = authData.access_token;

          if (!authToken) {
            console.error("❌ No auth token available - cannot download attachments");
          } else {
            for (const att of msgData.attachments) {
              const fileName = att.fileName || `attachment_${Date.now()}`;
              const contentType = att.contentType || "application/octet-stream";

              // Skip text/plain attachments (message body text)
              if (contentType === 'text/plain' || contentType?.startsWith('text/')) {
                console.log(`⏭️ Skipping text attachment: ${contentType}`);
                continue;
              }

              // Only process MMS-supported types: images, audio, video
              const isImage = contentType?.startsWith('image/');
              const isAudio = contentType?.startsWith('audio/');
              const isVideo = contentType?.startsWith('video/');
              
              if (!isImage && !isAudio && !isVideo) {
                console.log(`⏭️ Skipping unsupported attachment type: ${contentType}`);
                continue;
              }

              if (!att.uri) {
                console.warn(`⚠️ Attachment ${fileName} has no URI`);
                continue;
              }

              try {
                console.log(`📥 Downloading: ${fileName} (${contentType})`);
                console.log(`   URI: ${att.uri}`);
                
                // Construct full URL from relative URI
                const fullUrl = att.uri.startsWith('http') 
                  ? att.uri 
                  : `https://platform.ringcentral.com${att.uri}`;
                
                const azureUrl = await azureStorage.downloadAndUpload(
                  fullUrl,
                  fileName,
                  contentType,
                  authToken
                );

                processedAttachments.push({
                  id: att.id?.toString() || Date.now().toString(),
                  filename: fileName,
                  contentType,
                  azureUrl,
                  uri: azureUrl,
                  type: att.type || "MMS",
                });

                console.log(`✅ Attachment saved: ${fileName} → ${azureUrl}`);
              } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                console.error(`❌ Failed to save attachment ${fileName}:`, errorMessage);

                // Still save a placeholder so message isn't lost
                processedAttachments.push({
                  id: att.id?.toString() || Date.now().toString(),
                  filename: fileName + " (failed to save)",
                  contentType,
                  azureUrl: "",
                  uri: att.uri,
                  type: att.type || "MMS",
                });
              }
            }
          }
        } catch (authError: unknown) {
          const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
          console.error("❌ Failed to authenticate with RingCentral:", errorMessage);
        }
      }

      // === BUILD MESSAGE FOR CONVERSATION STRUCTURE ===
      const newMessage = {
        id: messageId,
        uri: msgData.uri || "",
        conversationId: msgData.conversation?.id?.toString() || messageId,
        from: {
          phoneNumber: phoneNumber,
        },
        to: msgData.to?.map((t: ToRecipient) => ({ phoneNumber: t.phoneNumber || "" })) || [],
        direction: "Inbound",
        type: processedAttachments.length > 0 ? "MMS" : (msgData.type || "SMS"),
        subject: msgData.subject || "",
        creationTime: new Date(msgData.creationTime).toISOString(),
        lastModifiedTime: new Date(msgData.lastModifiedTime).toISOString(),
        readStatus: "Unread",
        messageStatus: msgData.messageStatus || "Received",
        attachments: processedAttachments,
      };

      // === UPSERT INTO CONVERSATION ===
      const result = await conversationsCollection.updateOne(
        { phoneNumber: phoneNumber },
        {
          $push: {
            messages: newMessage,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          $set: {
            lastMessageTime: newMessage.creationTime,
          },
          $inc: {
            unreadCount: 1,
          },
          $setOnInsert: {
            phoneNumber: phoneNumber,
          },
        },
        { upsert: true }
      );

      console.log(`💾 Inbound message saved to conversation ${phoneNumber}:`);
      console.log(`   - Message ID: ${messageId}`);
      console.log(`   - Attachments: ${processedAttachments.length} (${processedAttachments.filter(a => a.azureUrl).length} with Azure URLs)`);
      console.log(`   - Type: ${newMessage.type}`);
      console.log(`   - Upserted: ${result.upsertedCount > 0}, Modified: ${result.modifiedCount > 0}`);

      // === NOTIFY RAILWAY FOR REAL-TIME UPDATE ===
      if (RAILWAY_NOTIFY_URL) {
        try {
          await fetch(`${RAILWAY_NOTIFY_URL}/notify/ringcentral`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: phoneNumber,
              messageId: messageId,
              timestamp: newMessage.creationTime,
              hasAttachments: processedAttachments.some(a => !!a.azureUrl),
            }),
          });
          console.log(`📡 Railway notified for ${phoneNumber}`);
        } catch (e) {
          console.error("Failed to notify Railway:", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("❌ Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}