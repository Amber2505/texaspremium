// app/api/webhook/ringcentral/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

const VALIDATION_TOKEN = process.env.RINGCENTRAL_WEBHOOK_TOKEN || "";
const RAILWAY_NOTIFY_URL = process.env.RAILWAY_NOTIFY_URL;
const MY_PHONE = process.env.RINGCENTRAL_PHONE_NUMBER || "";

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

interface MessageAttachment {
  id?: number;
  uri?: string;
  type?: string;
  fileName?: string;
  contentType?: string;
}

interface MessageData {
  id?: number;
  direction?: string;
  from?: { phoneNumber?: string };
  to?: ToRecipient[];
  attachments?: MessageAttachment[];
  subject?: string;
  type?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  messageStatus?: string;
  uri?: string;
  conversation?: { id?: number };
}

interface WebhookEvent {
  eventType?: string;
  body?: MessageData;
}

// Helper function to create a unique conversation ID from all participants
function createConversationId(fromNumber: string, toNumbers: string[]): string {
  // Collect all unique participants (excluding our own number)
  const participants = new Set<string>();
  
  // Add sender
  if (fromNumber && fromNumber !== MY_PHONE) {
    participants.add(fromNumber);
  }
  
  // Add all recipients (excluding our own number)
  toNumbers.forEach(num => {
    if (num && num !== MY_PHONE) {
      participants.add(num);
    }
  });
  
  // Sort alphabetically for consistency
  const sorted = Array.from(participants).sort();
  
  // Join with comma
  return sorted.join(',');
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
    const body: WebhookEvent[] = await request.json();

    for (const event of body) {
      if (event.eventType !== "/restapi/v1.0/account/~/extension/~/message-store") continue;

      const msgData = event.body;
      if (!msgData || msgData.direction !== "Inbound") continue;

      const client = await connectToDatabase;
      const db = client.db("db");
      
      // Use texas_premium_messages collection (conversation-based structure)
      const conversationsCollection = db.collection("texas_premium_messages");

      const fromNumber = msgData.from?.phoneNumber || "Unknown";
      const toNumbers = (msgData.to || []).map((t: ToRecipient) => t.phoneNumber || "").filter(Boolean);
      const messageId = msgData.id?.toString() || Date.now().toString();

      // Create conversation ID from all participants
      const conversationId = createConversationId(fromNumber, toNumbers);
      
      // For backward compatibility, also store primary phone number (the sender for inbound)
      const primaryPhone = fromNumber;
      
      // Determine if this is a group message
      const isGroup = toNumbers.filter(n => n !== MY_PHONE).length > 1 || 
                     (toNumbers.length === 1 && fromNumber !== toNumbers[0]);

      console.log(`📥 Inbound message from ${fromNumber}`);
      console.log(`   To: ${toNumbers.join(', ')}`);
      console.log(`   Group: ${isGroup ? 'YES' : 'NO'}`);
      console.log(`   Conversation ID: ${conversationId}`);

      // Check if this message already exists in the conversation
      const existingConversation = await conversationsCollection.findOne({
        conversationId: conversationId,
        "messages.id": messageId,
      });

      if (existingConversation) {
        console.log("⏭️ Duplicate message skipped:", messageId);
        continue;
      }

      // === PROCESS ATTACHMENTS ===
      const processedAttachments: ProcessedAttachment[] = [];

      if (msgData.attachments && msgData.attachments.length > 0) {
        console.log(`📎 Processing ${msgData.attachments.length} inbound attachment(s) from ${fromNumber}...`);

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
          phoneNumber: fromNumber,
        },
        to: msgData.to?.map((t: ToRecipient) => ({ phoneNumber: t.phoneNumber || "" })) || [],
        direction: "Inbound",
        type: processedAttachments.length > 0 ? "MMS" : (msgData.type || "SMS"),
        subject: msgData.subject || "",
        creationTime: new Date(msgData.creationTime || Date.now()).toISOString(),
        lastModifiedTime: new Date(msgData.lastModifiedTime || Date.now()).toISOString(),
        readStatus: "Unread",
        messageStatus: msgData.messageStatus || "Received",
        attachments: processedAttachments,
      };

      // === CRITICAL FIX: DELETE OLD SINGLE-PARTICIPANT CONVERSATIONS ===
      // When a group message arrives, remove any old individual conversations
      // for the same participants to prevent split conversations
      if (isGroup) {
        const participantsList = conversationId.split(',');
        
        // Find and delete any old single-participant conversations
        for (const participant of participantsList) {
          const oldConvs = await conversationsCollection.find({
            $or: [
              { phoneNumber: participant, conversationId: { $exists: false } },
              { phoneNumber: participant, isGroup: { $ne: true } },
              { conversationId: participant }
            ]
          }).toArray();

          for (const oldConv of oldConvs) {
            console.log(`🗑️ Deleting old single conversation for ${participant} (merging into group)`);
            
            // Migrate messages from old conversation to the group conversation
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldMessages = (oldConv as any).messages || [];
            if (oldMessages.length > 0) {
              console.log(`📦 Migrating ${oldMessages.length} messages from old conversation`);
              await conversationsCollection.updateOne(
                { conversationId: conversationId },
                {
                  $push: {
                    messages: {
                      $each: oldMessages
                    }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any
                },
                { upsert: true }
              );
            }
            
            // Delete the old conversation
            await conversationsCollection.deleteOne({ _id: oldConv._id });
          }
        }
      }

      // === UPSERT INTO CONVERSATION ===
      const result = await conversationsCollection.updateOne(
        { conversationId: conversationId },
        {
          $push: {
            messages: newMessage,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          $set: {
            lastMessageTime: newMessage.creationTime,
            conversationId: conversationId,  // Ensure it's always set
            participants: conversationId.split(','),  // Always update participants list
            isGroup: isGroup,  // Always update group status
            phoneNumber: primaryPhone, // Update primary phone
          },
          $inc: {
            unreadCount: 1,
          },
        },
        { upsert: true }
      );

      console.log(`💾 Inbound message saved to conversation ${conversationId}:`);
      console.log(`   - Message ID: ${messageId}`);
      console.log(`   - Attachments: ${processedAttachments.length} (${processedAttachments.filter(a => a.azureUrl).length} with Azure URLs)`);
      console.log(`   - Type: ${newMessage.type}`);
      console.log(`   - Is Group: ${isGroup}`);
      console.log(`   - Upserted: ${result.upsertedCount > 0}, Modified: ${result.modifiedCount > 0}`);

      // === NOTIFY RAILWAY FOR REAL-TIME UPDATE ===
      if (RAILWAY_NOTIFY_URL) {
        try {
          await fetch(`${RAILWAY_NOTIFY_URL}/notify/ringcentral`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: conversationId,
              phoneNumber: primaryPhone,
              messageId: messageId,
              timestamp: newMessage.creationTime,
              hasAttachments: processedAttachments.some(a => !!a.azureUrl),
              isGroup: isGroup,
            }),
          });
          console.log(`📡 Railway notified for ${conversationId}`);
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