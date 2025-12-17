// app/api/messages/fix-misrouted/route.ts
// Moves messages that are in individual but should be in group
import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

async function getRingCentralAuth(): Promise<string | null> {
  try {
    const rcsdk = new SDK({
      server: RINGCENTRAL_SERVER,
      clientId: process.env.RINGCENTRAL_CLIENT_ID,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    });
    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
    const authData = await platform.auth().data();
    return authData.access_token || null;
  } catch (e) {
    console.error("RC Auth error:", e);
    return null;
  }
}

async function fetchRcConversationId(messageId: string, authToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.conversation?.id?.toString() || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("🔧 FIX MISROUTED MESSAGES");
    console.log("════════════════════════════════════════════════════════════\n");

    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    const authToken = await getRingCentralAuth();
    if (!authToken) {
      return NextResponse.json({ error: "Failed to get RC auth" }, { status: 500 });
    }

    const stats = {
      individualsChecked: 0,
      messagesChecked: 0,
      messagesMoved: 0,
      apiCalls: 0,
      errors: 0,
    };

    // Get all groups with rcConversationId
    const groups = await conversationsCollection.find({ 
      isGroup: true,
      rcConversationId: { $exists: true, $ne: null }
    }).toArray();
    
    console.log(`Found ${groups.length} groups with rcConversationId`);
    
    // Build map: rcConversationId -> group
    const rcConvIdToGroup = new Map<string, {
      conversationId: string;
      participants: string[];
    }>();
    
    for (const group of groups) {
      if (group.rcConversationId) {
        rcConvIdToGroup.set(group.rcConversationId, {
          conversationId: group.conversationId,
          participants: group.participants || [],
        });
        console.log(`  Group ${group.conversationId} → rcConvId: ${group.rcConversationId}`);
      }
    }

    // Get all individual conversations
    const individuals = await conversationsCollection.find({
      $or: [{ isGroup: false }, { isGroup: { $exists: false } }]
    }).toArray();
    
    console.log(`\nChecking ${individuals.length} individual conversations...`);

    for (const individual of individuals) {
      stats.individualsChecked++;
      const inboundMessages = (individual.messages || []).filter(
        (m: { direction?: string }) => m.direction === "Inbound"
      );
      
      if (inboundMessages.length === 0) continue;
      
      const messagesToMove: Array<{
        message: Record<string, unknown>;
        targetGroup: string;
        targetParticipants: string[];
      }> = [];
      
      // Check last 10 inbound messages (to avoid too many API calls)
      const recentInbound = inboundMessages.slice(-10);
      
      for (const msg of recentInbound) {
        if (!msg.id) continue;
        
        stats.messagesChecked++;
        stats.apiCalls++;
        
        // Rate limit
        await new Promise(r => setTimeout(r, 100));
        
        const rcConvId = await fetchRcConversationId(msg.id, authToken);
        
        if (rcConvId && rcConvIdToGroup.has(rcConvId)) {
          const group = rcConvIdToGroup.get(rcConvId)!;
          console.log(`\n  ⚠️ MISROUTED: Message ${msg.id} (${msg.subject?.substring(0, 30)}...)`);
          console.log(`     Currently in: ${individual.conversationId || individual.phoneNumber}`);
          console.log(`     Should be in: ${group.conversationId}`);
          
          messagesToMove.push({
            message: msg,
            targetGroup: group.conversationId,
            targetParticipants: group.participants,
          });
        }
      }
      
      // Move messages to their correct groups
      for (const { message, targetGroup, targetParticipants } of messagesToMove) {
        try {
          // Add to group
          await conversationsCollection.updateOne(
            { conversationId: targetGroup },
            {
              $push: { 
                messages: {
                  $each: [message],
                  $sort: { creationTime: 1 }
                }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
              $set: {
                lastMessageTime: message.creationTime,
                participants: targetParticipants,
                isGroup: true,
              },
              $inc: { unreadCount: message.readStatus === "Unread" ? 1 : 0 },
            }
          );
          
          // Remove from individual
          await conversationsCollection.updateOne(
            { _id: individual._id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { $pull: { messages: { id: message.id } } } as any
          );
          
          console.log(`     ✅ MOVED to group!`);
          stats.messagesMoved++;
        } catch (e) {
          console.error(`     ❌ Failed to move:`, e);
          stats.errors++;
        }
      }
      
      // Check if individual is now empty
      if (messagesToMove.length > 0) {
        const updated = await conversationsCollection.findOne({ _id: individual._id });
        if (updated && (!updated.messages || updated.messages.length === 0)) {
          console.log(`  🗑️ Deleting empty individual: ${individual.conversationId}`);
          await conversationsCollection.deleteOne({ _id: individual._id });
        } else if (updated) {
          // Recalculate unread
          const newUnread = (updated.messages || []).filter(
            (m: { direction?: string; readStatus?: string }) => 
              m.direction === "Inbound" && m.readStatus === "Unread"
          ).length;
          await conversationsCollection.updateOne(
            { _id: individual._id },
            { $set: { unreadCount: newUnread } }
          );
        }
      }
    }

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("✅ FIX COMPLETE");
    console.log(`   Individuals checked: ${stats.individualsChecked}`);
    console.log(`   Messages checked: ${stats.messagesChecked}`);
    console.log(`   Messages moved: ${stats.messagesMoved}`);
    console.log(`   API calls: ${stats.apiCalls}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log("════════════════════════════════════════════════════════════\n");

    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error("❌ Fix error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}