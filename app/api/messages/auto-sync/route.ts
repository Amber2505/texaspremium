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

// Type for stored message
interface StoredMessage {
  id?: string;
  direction?: string;
  readStatus?: string;
  subject?: string;
  creationTime?: string;
}

export async function GET() {
  try {
    console.log("🔄 Auto-syncing messages...");
    
    const platform = await getRingCentralClient();
    
    // Fetch messages from last 60 minutes (increased for testing)
    const dateFrom = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    console.log(`📅 Fetching messages from: ${dateFrom}`);
    
    const response = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 100,
    });

    const data = await response.json();
    const messages = data.records || [];

    console.log(`📥 Found ${messages.length} messages from RingCentral`);
    
    if (messages.length > 0) {
      console.log("First message sample:", {
        id: messages[0].id,
        direction: messages[0].direction,
        subject: messages[0].subject?.substring(0, 50),
        from: messages[0].from?.phoneNumber,
        to: messages[0].to?.[0]?.phoneNumber,
      });
    }

    // Import MongoDB and save
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    let newCount = 0;
    let updatedConversations = 0;
    let attachmentsDownloaded = 0;
    
    for (const msg of messages) {
      // Determine the other party's phone number
      const isOutbound = msg.direction === "Outbound";
      const otherPhone = isOutbound 
        ? msg.to?.[0]?.phoneNumber 
        : msg.from?.phoneNumber;
      
      if (!otherPhone) continue;

      // Check if message already exists in conversation
      const existingConv = await conversationsCollection.findOne({ 
        phoneNumber: otherPhone,
        "messages.id": msg.id.toString()
      });
      
      if (existingConv) {
        continue; // Message already exists, skip
      }

      // Process attachments - download from RingCentral and upload to Azure
      const processedAttachments = [];
      if (msg.attachments && msg.attachments.length > 0) {
        const { azureStorage } = await import("@/lib/services/azureStorage");
        
        // Get auth token from platform
        const authData = await platform.auth().data();
        const authToken = authData.access_token;
        
        if (!authToken) {
          console.error('❌ No auth token available');
          continue;
        }
        
        for (const attachment of msg.attachments) {
          try {
            // Skip text/plain attachments (these are just message bodies, not actual files)
            if (attachment.contentType === 'text/plain' || attachment.contentType?.startsWith('text/')) {
              console.log(`⏭️  Skipping text attachment: ${attachment.contentType}`);
              continue;
            }
            
            // Only process MMS-supported types: images, audio, video
            const isImage = attachment.contentType?.startsWith('image/');
            const isAudio = attachment.contentType?.startsWith('audio/');
            const isVideo = attachment.contentType?.startsWith('video/');
            
            if (!isImage && !isAudio && !isVideo) {
              console.log(`⏭️  Skipping unsupported attachment type: ${attachment.contentType}`);
              continue;
            }
            
            const filename = `${msg.id}_${attachment.id}.${attachment.contentType.split('/')[1]}`;
            
            console.log(`📥 Processing ${attachment.contentType} attachment: ${attachment.uri}`);
            
            // Use existing downloadAndUpload method with auth token
            const azureUrl = await azureStorage.downloadAndUpload(
              attachment.uri,
              filename,
              attachment.contentType,
              authToken
            );
            
            processedAttachments.push({
              id: attachment.id.toString(),
              uri: attachment.uri,
              type: attachment.type,
              contentType: attachment.contentType,
              azureUrl: azureUrl,
              filename: filename,
            });
            
            attachmentsDownloaded++;
            console.log(`✅ Saved attachment to Azure: ${azureUrl}`);
          } catch (error) {
            console.error(`❌ Failed to process attachment:`, error);
            // Don't save failed attachments
          }
        }
      }

      // Prepare message object
      const messageObj = {
        id: msg.id.toString(),
        direction: msg.direction,
        type: msg.type,
        subject: msg.subject || "",
        creationTime: msg.creationTime,
        lastModifiedTime: msg.lastModifiedTime,
        readStatus: msg.direction === "Inbound" ? "Unread" : "Read",
        messageStatus: msg.messageStatus,
        from: msg.from,
        to: msg.to,
        attachments: processedAttachments,
      };

      // Upsert conversation: add message to array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateOperation: any = {
        $push: { 
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 }
          }
        },
        $set: {
          lastMessageTime: msg.creationTime,
          lastMessageId: msg.id.toString(),
        },
      };

      // Add unread increment only for inbound messages
      if (msg.direction === "Inbound") {
        updateOperation.$inc = { unreadCount: 1 };
      }

      const result = await conversationsCollection.updateOne(
        { phoneNumber: otherPhone },
        updateOperation,
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        console.log(`✨ Created new conversation for ${otherPhone}`);
      }
      
      console.log(`💾 Added message ${msg.id} to conversation ${otherPhone}`);
      newCount++;
      updatedConversations++;
    }

    console.log(`✅ Synced ${newCount} new messages across ${updatedConversations} conversations, ${attachmentsDownloaded} attachments`);

    // ============================================
    // TWO-WAY READ STATUS SYNC
    // Sync read status FROM RingCentral TO MongoDB
    // ============================================
    console.log("🔄 Starting two-way read status sync...");
    
    let readStatusSynced = 0;
    
    try {
      // Get all conversations from MongoDB
      const allConversations = await conversationsCollection.find({}).toArray();
      
      // Collect all unread message IDs across all conversations
      const unreadMessageMap = new Map<string, { phoneNumber: string; messageId: string }>();
      
      for (const conversation of allConversations) {
        const phoneNumber = conversation.phoneNumber;
        const conversationMessages: StoredMessage[] = conversation.messages || [];

        const unreadInboundMessages = conversationMessages.filter(
          (msg: StoredMessage) =>
            msg.direction === "Inbound" &&
            msg.readStatus === "Unread" &&
            msg.id
        );

        unreadInboundMessages.forEach((msg: StoredMessage) => {
          if (msg.id) {
            unreadMessageMap.set(msg.id, {
              phoneNumber: phoneNumber,
              messageId: msg.id,
            });
          }
        });
      }

      console.log(`📬 Checking ${unreadMessageMap.size} unread messages in RingCentral`);

      if (unreadMessageMap.size > 0) {
        // Fetch messages that are marked as Read in RingCentral
        const readStatusResponse = await platform.get(
          "/restapi/v1.0/account/~/extension/~/message-store",
          {
            messageType: ["SMS", "MMS"],
            readStatus: "Read",
            perPage: 1000,
          }
        );

        const rcReadMessages = (await readStatusResponse.json()).records || [];
        console.log(`📥 Retrieved ${rcReadMessages.length} Read messages from RingCentral`);

        const conversationsToUpdate = new Set<string>();

        // Check which of our unread messages are now read in RingCentral
        for (const rcMessage of rcReadMessages) {
          const messageId = rcMessage.id.toString();

          if (unreadMessageMap.has(messageId)) {
            const messageInfo = unreadMessageMap.get(messageId);
            if (!messageInfo) continue;
            
            const { phoneNumber } = messageInfo;

            console.log(`✅ Message ${messageId} is Read in RingCentral - syncing to MongoDB`);

            // Update the message's read status in MongoDB
            await conversationsCollection.updateOne(
              {
                phoneNumber: phoneNumber,
                "messages.id": messageId,
              },
              {
                $set: {
                  "messages.$.readStatus": "Read",
                },
              }
            );

            conversationsToUpdate.add(phoneNumber);
            readStatusSynced++;
          }
        }

        // Recalculate unread counts for affected conversations
        for (const phoneNumber of conversationsToUpdate) {
          const conversation = await conversationsCollection.findOne({
            phoneNumber: phoneNumber,
          });

          if (conversation) {
            const conversationMsgs: StoredMessage[] = conversation.messages || [];
            const newUnreadCount = conversationMsgs.filter(
              (m: StoredMessage) => m.direction === "Inbound" && m.readStatus === "Unread"
            ).length;

            await conversationsCollection.updateOne(
              { phoneNumber: phoneNumber },
              {
                $set: {
                  unreadCount: newUnreadCount,
                },
              }
            );

            console.log(`📊 Updated unread count for ${phoneNumber}: ${newUnreadCount}`);
          }
        }

        console.log(`✅ Two-way read sync: Updated ${readStatusSynced} messages to Read`);
      } else {
        console.log(`ℹ️  No unread messages to sync`);
      }
    } catch (readSyncError) {
      console.error("❌ Two-way read sync failed:", readSyncError);
      // Don't throw - let the rest of auto-sync complete successfully
    }
    // ============================================
    // END: Two-Way Read Status Sync
    // ============================================

    return NextResponse.json({
      success: true,
      checked: messages.length,
      synced: newCount,
      conversationsUpdated: updatedConversations,
      attachmentsDownloaded: attachmentsDownloaded,
      readStatusSynced: readStatusSynced,
    });
  } catch (error: unknown) {
    console.error("❌ Auto-sync error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}