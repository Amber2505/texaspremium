import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

interface StoredMessage {
  id?: string;
  direction?: string;
  readStatus?: string;
  attachments?: Array<{ azureUrl?: string }>;
}

export async function GET() {
  try {
    console.log("\n\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🔄 [AUTO-SYNC] Starting at:", new Date().toISOString());
    console.log("═══════════════════════════════════════════════════════════");
    
    // STEP 1: Login and get token
    console.log("\n🔐 [AUTH] Logging in...");
    const rcsdk = new SDK({
      server: RINGCENTRAL_SERVER,
      clientId: process.env.RINGCENTRAL_CLIENT_ID,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    });

    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
    
    const authData = await platform.auth().data();
    const authToken = authData.access_token;
    
    if (!authToken) {
      console.error('❌ [AUTH] No token!');
      return NextResponse.json({ error: "No auth token" }, { status: 500 });
    }
    console.log(`🔐 [AUTH] ✅ Token: ${authToken.substring(0, 30)}...`);
    
    // STEP 2: Import dependencies
    const { azureStorage } = await import("@/lib/services/azureStorage");
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    // STEP 3: Fetch messages
    const dateFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    console.log(`\n📅 Fetching messages from: ${dateFrom}`);
    
    const response = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 50,
    });

    const data = await response.json();
    const messages = data.records || [];
    console.log(`📥 Found ${messages.length} messages`);

    const stats = { 
      processed: 0, 
      skipped: 0, 
      newSaved: 0, 
      fixed: 0, 
      attachmentsDownloaded: 0,
      errors: 0
    };
    
    // STEP 4: Process each message
    for (const msg of messages) {
      const messageId = msg.id.toString();
      const isOutbound = msg.direction === "Outbound";
      const otherPhone = isOutbound ? msg.to?.[0]?.phoneNumber : msg.from?.phoneNumber;
      
      if (!otherPhone) continue;
      
      // Only process inbound messages with potential attachments
      if (msg.direction !== "Inbound") {
        continue;
      }

      console.log(`\n────────────────────────────────────────`);
      console.log(`📨 Message ${messageId} from ${otherPhone}`);
      console.log(`   List API attachments: ${msg.attachments?.length || 0}`);

      // Check MongoDB
      const existingConv = await conversationsCollection.findOne({ phoneNumber: otherPhone });
      const existingMsg = existingConv?.messages?.find((m: StoredMessage) => m.id === messageId);

      if (existingMsg) {
        // Message exists - check if needs fixing
        const hasAzureUrls = existingMsg.attachments?.some((a: { azureUrl?: string }) => a.azureUrl);
        console.log(`   MongoDB: EXISTS, has azureUrls: ${hasAzureUrls}`);
        
        if (hasAzureUrls) {
          console.log(`   ⏭️ Skipping - already has attachments`);
          stats.skipped++;
          continue;
        }
        console.log(`   🔧 Needs attachment fix`);
      } else {
        console.log(`   MongoDB: NEW message`);
      }

      // ALWAYS fetch full message for inbound
      console.log(`   🔍 Fetching full message...`);
      
      let fullMessage;
      try {
        const fullMsgResponse = await fetch(
          `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
          { headers: { 'Authorization': `Bearer ${authToken}` } }
        );
        
        if (!fullMsgResponse.ok) {
          console.log(`   ❌ Fetch failed: ${fullMsgResponse.status}`);
          stats.errors++;
          continue;
        }
        
        fullMessage = await fullMsgResponse.json();
        console.log(`   ✅ Full message has ${fullMessage.attachments?.length || 0} attachments`);
      } catch (e) {
        console.log(`   ❌ Fetch error:`, e);
        stats.errors++;
        continue;
      }

      // Process attachments
      const processedAttachments = [];
      
      if (fullMessage.attachments && fullMessage.attachments.length > 0) {
        for (const att of fullMessage.attachments) {
          console.log(`   📎 Attachment: ${att.contentType} (${att.type})`);
          
          // Skip text
          if (!att.contentType || att.contentType.startsWith('text/')) {
            console.log(`      ⏭️ Skipping text`);
            continue;
          }
          
          // Only media
          if (!att.contentType.startsWith('image/') && 
              !att.contentType.startsWith('audio/') && 
              !att.contentType.startsWith('video/')) {
            console.log(`      ⏭️ Skipping non-media`);
            continue;
          }

          if (!att.uri) {
            console.log(`      ⚠️ No URI!`);
            continue;
          }

          console.log(`      URI: ${att.uri}`);
          
          try {
            const extension = att.contentType.split('/')[1] || 'bin';
            const filename = `${messageId}_${att.id}.${extension}`;
            
            console.log(`      📥 Downloading ${filename}...`);
            
            const azureUrl = await azureStorage.downloadAndUpload(
              att.uri,  // URI is already complete
              filename,
              att.contentType,
              authToken
            );
            
            if (azureUrl) {
              console.log(`      ✅ Saved: ${azureUrl.substring(0, 60)}...`);
              processedAttachments.push({
                id: att.id?.toString(),
                uri: att.uri,
                type: att.type,
                contentType: att.contentType,
                azureUrl: azureUrl,
                filename: filename,
              });
              stats.attachmentsDownloaded++;
            } else {
              console.log(`      ❌ Azure returned null`);
              stats.errors++;
            }
          } catch (e) {
            console.log(`      ❌ Error:`, e);
            stats.errors++;
          }
        }
      }

      console.log(`   📊 Processed ${processedAttachments.length} attachments`);

      // Save to MongoDB
      if (existingMsg) {
        // Update existing
        const result = await conversationsCollection.updateOne(
          { phoneNumber: otherPhone, "messages.id": messageId },
          { 
            $set: { 
              "messages.$.attachments": processedAttachments,
              "messages.$.type": processedAttachments.length > 0 ? "MMS" : "SMS"
            } 
          }
        );
        console.log(`   💾 Updated: modified=${result.modifiedCount}`);
        if (result.modifiedCount > 0) stats.fixed++;
      } else {
        // Add new message
        const messageObj = {
          id: messageId,
          direction: fullMessage.direction,
          type: processedAttachments.length > 0 ? "MMS" : "SMS",
          subject: fullMessage.subject || "",
          creationTime: fullMessage.creationTime,
          lastModifiedTime: fullMessage.lastModifiedTime,
          readStatus: "Unread",
          messageStatus: fullMessage.messageStatus,
          from: fullMessage.from,
          to: fullMessage.to,
          attachments: processedAttachments,
        };

        const result = await conversationsCollection.updateOne(
          { phoneNumber: otherPhone, "messages.id": { $ne: messageId } },
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            $push: { messages: { $each: [messageObj], $sort: { creationTime: 1 } } } as any,
            $set: { lastMessageTime: fullMessage.creationTime, lastMessageId: messageId },
            $inc: { unreadCount: 1 },
          },
          { upsert: true }
        );
        
        console.log(`   💾 Added: modified=${result.modifiedCount}, upserted=${result.upsertedCount}`);
        if (result.modifiedCount > 0 || result.upsertedCount > 0) stats.newSaved++;
      }
      
      stats.processed++;
    }

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`✅ [AUTO-SYNC] Complete!`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   New saved: ${stats.newSaved}`);
    console.log(`   Fixed: ${stats.fixed}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Attachments: ${stats.attachmentsDownloaded}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    // Quick read status sync
    try {
      const allConvs = await conversationsCollection.find({}).toArray();
      for (const conv of allConvs) {
        const unread = (conv.messages || []).filter(
          (m: StoredMessage) => m.direction === "Inbound" && m.readStatus === "Unread"
        ).length;
        if (conv.unreadCount !== unread) {
          await conversationsCollection.updateOne(
            { phoneNumber: conv.phoneNumber },
            { $set: { unreadCount: unread } }
          );
        }
      }
    } catch (e) {
      console.error("Read sync error:", e);
    }

    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error("❌ FATAL:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" }, 
      { status: 500 }
    );
  }
}