// app/api/messages/fix-attachments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";

export const dynamic = "force-dynamic";

// Type definitions
interface RCAttachment {
  id: string | number;
  uri?: string;
  type?: string;
  contentType?: string;
}

interface RCMessage {
  id: string | number;
  direction?: string;
  from?: { phoneNumber?: string };
  to?: Array<{ phoneNumber?: string }>;
  attachments?: RCAttachment[];
}

interface MongoMessage {
  id?: string;
  attachments?: Array<{
    azureUrl?: string;
    [key: string]: unknown;
  }>;
}

interface ProcessedAttachment {
  id: string;
  uri?: string;
  type?: string;
  contentType?: string;
  azureUrl: string;
  filename: string;
}

interface FixResults {
  checked: number;
  fixed: number;
  skipped: number;
  inboundFixed: number;
  outboundFixed: number;
  errors: Array<{ messageId: string; attachmentId?: string | number; error: string }>;
  details: Array<Record<string, unknown>>;
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
    const phoneNumber = searchParams.get("phoneNumber");
    const dryRun = searchParams.get("dryRun") === "true";
    
    console.log(`🔧 Fix attachments starting... (dryRun: ${dryRun})`);
    
    const platform = await getRingCentralClient();
    const authData = await platform.auth().data();
    const authToken = authData.access_token;
    
    if (!authToken) {
      return NextResponse.json({ error: "No auth token" }, { status: 500 });
    }

    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    // Fetch messages from RingCentral (last 30 days) with pagination
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    let allRcMessages: RCMessage[] = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
        messageType: "SMS",
        dateFrom: dateFrom,
        perPage: 250,
        page: page,
      });
      const data = await response.json() as { records?: RCMessage[] };
      const records = data.records || [];
      
      allRcMessages = allRcMessages.concat(records);
      console.log(`📥 Page ${page}: Retrieved ${records.length} messages (total: ${allRcMessages.length})`);
      
      // Check if there are more pages
      if (records.length < 250 || page >= 10) {
        hasMore = false;
      } else {
        page++;
      }
    }
    
    const rcMessages = allRcMessages;
    console.log(`📥 Found ${rcMessages.length} total messages from RingCentral (last 30 days)`);

    const results: FixResults = {
      checked: 0,
      fixed: 0,
      skipped: 0,
      inboundFixed: 0,
      outboundFixed: 0,
      errors: [],
      details: [],
    };

    for (const rcMsg of rcMessages) {
      // Filter by phone if provided
      if (phoneNumber) {
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        const fromPhone = rcMsg.from?.phoneNumber?.replace(/\D/g, '') || '';
        const toPhone = rcMsg.to?.[0]?.phoneNumber?.replace(/\D/g, '') || '';
        if (!fromPhone.includes(normalizedPhone) && !toPhone.includes(normalizedPhone)) {
          continue;
        }
      }

      results.checked++;
      const messageId = rcMsg.id.toString();
      const direction = rcMsg.direction; // "Inbound" or "Outbound"
      
      // Check if RC message has image/audio/video attachments
      const rcImageAttachments = (rcMsg.attachments || []).filter((att: RCAttachment) => {
        const ct = att.contentType || '';
        return ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/');
      });

      if (rcImageAttachments.length === 0) {
        results.skipped++;
        continue; // No media attachments in RC
      }

      // Determine phone number for conversation lookup
      // For Outbound: other party is in "to"
      // For Inbound: other party is in "from"
      const isOutbound = direction === "Outbound";
      const otherPhone = isOutbound ? rcMsg.to?.[0]?.phoneNumber : rcMsg.from?.phoneNumber;
      
      if (!otherPhone) {
        results.skipped++;
        continue;
      }

      console.log(`🔍 Checking ${direction} message ${messageId} (${otherPhone}) - ${rcImageAttachments.length} media attachments`);

      // Find this message in MongoDB
      const conversation = await conversationsCollection.findOne({
        phoneNumber: otherPhone,
        "messages.id": messageId,
      });

      if (!conversation) {
        results.details.push({
          messageId,
          phone: otherPhone,
          direction,
          status: "not_in_mongodb",
          rcAttachments: rcImageAttachments.length,
        });
        results.skipped++;
        continue;
      }

      // Find the specific message in the conversation
      const messages = conversation.messages as MongoMessage[] | undefined;
      const mongoMessage = messages?.find((m: MongoMessage) => m.id === messageId);
      
      if (!mongoMessage) {
        results.skipped++;
        continue;
      }

      // Check if MongoDB message has Azure URLs for attachments
      const mongoAttachmentsWithAzure = (mongoMessage.attachments || []).filter(
        (att) => att.azureUrl && att.azureUrl.length > 0
      );

      if (mongoAttachmentsWithAzure.length >= rcImageAttachments.length) {
        results.details.push({
          messageId,
          phone: otherPhone,
          direction,
          status: "already_has_attachments",
          mongoAttachments: mongoAttachmentsWithAzure.length,
          rcAttachments: rcImageAttachments.length,
        });
        results.skipped++;
        continue;
      }

      // Need to download and fix attachments
      console.log(`🔧 Fixing ${direction} message ${messageId} for ${otherPhone}`);
      console.log(`   RC has ${rcImageAttachments.length} media attachments`);
      console.log(`   MongoDB has ${mongoAttachmentsWithAzure.length} with Azure URLs`);

      if (dryRun) {
        results.details.push({
          messageId,
          phone: otherPhone,
          direction,
          status: "would_fix",
          rcAttachments: rcImageAttachments.map((a: RCAttachment) => ({
            id: a.id,
            type: a.contentType,
            uri: a.uri,
          })),
        });
        results.fixed++;
        if (direction === "Inbound") results.inboundFixed++;
        else results.outboundFixed++;
        continue;
      }

      // Download and upload attachments
      const processedAttachments: ProcessedAttachment[] = [];

      for (const att of rcImageAttachments) {
        try {
          const contentType = att.contentType || 'application/octet-stream';
          const filename = `${messageId}_${att.id}.${contentType.split('/')[1]}`;
          
          console.log(`📥 Downloading: ${contentType} from ${att.uri}`);
          
          const azureUrl = await azureStorage.downloadAndUpload(
            att.uri || '',
            filename,
            contentType,
            authToken
          );

          processedAttachments.push({
            id: att.id.toString(),
            uri: att.uri,
            type: att.type,
            contentType: contentType,
            azureUrl: azureUrl,
            filename: filename,
          });

          console.log(`✅ Uploaded to Azure: ${azureUrl}`);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error(`❌ Failed to process attachment:`, errorMessage);
          results.errors.push({
            messageId,
            attachmentId: att.id,
            error: errorMessage,
          });
        }
      }

      if (processedAttachments.length > 0) {
        // Update MongoDB with the new attachments
        await conversationsCollection.updateOne(
          {
            phoneNumber: otherPhone,
            "messages.id": messageId,
          },
          {
            $set: {
              "messages.$.attachments": processedAttachments,
              "messages.$.type": "MMS",
            },
          }
        );

        results.details.push({
          messageId,
          phone: otherPhone,
          direction,
          status: "fixed",
          attachmentsAdded: processedAttachments.length,
          azureUrls: processedAttachments.map((a) => a.azureUrl),
        });
        results.fixed++;
        if (direction === "Inbound") results.inboundFixed++;
        else results.outboundFixed++;

        console.log(`✅ Fixed ${direction} message ${messageId} with ${processedAttachments.length} attachments`);
      }
    }

    console.log(`🏁 Fix complete: checked=${results.checked}, fixed=${results.fixed} (inbound=${results.inboundFixed}, outbound=${results.outboundFixed}), skipped=${results.skipped}`);

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        checked: results.checked,
        fixed: results.fixed,
        inboundFixed: results.inboundFixed,
        outboundFixed: results.outboundFixed,
        skipped: results.skipped,
        errors: results.errors.length,
      },
      errors: results.errors,
      details: results.details,
    });
  } catch (error: unknown) {
    console.error("❌ Fix attachments error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}