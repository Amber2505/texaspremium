// app/api/messages/repair-groups/route.ts
// Fixes: 1) Remove duplicates 2) Backfill rcConversationId from message history
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
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("🔧 REPAIR GROUPS - Fixing duplicates & backfilling rcConversationId");
    console.log("═══════════════════════════════════════════════════════════\n");

    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    const stats = {
      groupsProcessed: 0,
      rcConversationIdBackfilled: 0,
      duplicatesRemoved: 0,
      emptyConversationsDeleted: 0,
      apiCalls: 0,
    };

    // Get auth token for RingCentral API
    const authToken = await getRingCentralAuth();
    if (!authToken) {
      return NextResponse.json({ error: "Failed to get RingCentral auth" }, { status: 500 });
    }

    // Get all groups
    const groups = await conversationsCollection.find({ isGroup: true }).toArray();
    console.log(`Found ${groups.length} group conversations\n`);

    // STEP 1: Backfill rcConversationId for groups that don't have it
    for (const group of groups) {
      stats.groupsProcessed++;
      console.log(`\n📱 Group: ${group.conversationId}`);
      console.log(`   Current rcConversationId: ${group.rcConversationId || "❌ NOT SET"}`);
      
      if (!group.rcConversationId) {
        // Find an OUTBOUND message to get rcConversationId (sent from our app)
        const outboundMsg = (group.messages || []).find(
          (m: { direction?: string; id?: string }) => m.direction === "Outbound" && m.id
        );
        
        if (outboundMsg?.id) {
          console.log(`   🔍 Fetching rcConversationId from message: ${outboundMsg.id}`);
          stats.apiCalls++;
          
          const rcConvId = await fetchRcConversationId(outboundMsg.id, authToken);
          
          if (rcConvId) {
            await conversationsCollection.updateOne(
              { _id: group._id },
              { $set: { rcConversationId: rcConvId } }
            );
            console.log(`   ✅ Set rcConversationId: ${rcConvId}`);
            stats.rcConversationIdBackfilled++;
          } else {
            console.log(`   ⚠️ Could not fetch rcConversationId`);
          }
          
          // Rate limit - small delay between API calls
          await new Promise(r => setTimeout(r, 200));
        } else {
          console.log(`   ⚠️ No outbound message found to fetch rcConversationId`);
        }
      }
    }

    // STEP 2: Remove duplicates - messages that exist in both group AND individual
    console.log("\n\n🔍 Finding and removing duplicates...\n");
    
    // Reload groups with updated rcConversationId
    const updatedGroups = await conversationsCollection.find({ isGroup: true }).toArray();
    
    // Build map of all group message IDs
    const groupMessageMap = new Map<string, string>(); // messageId -> groupConversationId
    for (const group of updatedGroups) {
      for (const msg of (group.messages || [])) {
        if (msg.id) {
          groupMessageMap.set(msg.id, group.conversationId);
        }
      }
    }
    
    // Find individuals and remove duplicates
    const individuals = await conversationsCollection.find({
      $or: [{ isGroup: false }, { isGroup: { $exists: false } }]
    }).toArray();
    
    for (const individual of individuals) {
      const duplicateIds: string[] = [];
      
      for (const msg of (individual.messages || [])) {
        if (msg.id && groupMessageMap.has(msg.id)) {
          duplicateIds.push(msg.id);
        }
      }
      
      if (duplicateIds.length > 0) {
        console.log(`   🗑️ Removing ${duplicateIds.length} duplicates from: ${individual.conversationId || individual.phoneNumber}`);
        
        
        await conversationsCollection.updateOne(
          { _id: individual._id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { $pull: { messages: { id: { $in: duplicateIds } } } } as any
        );
        
        stats.duplicatesRemoved += duplicateIds.length;
        
        // Check if conversation is now empty
        const updated = await conversationsCollection.findOne({ _id: individual._id });
        if (updated && (!updated.messages || updated.messages.length === 0)) {
          console.log(`   🗑️ Deleting empty conversation: ${individual.conversationId || individual.phoneNumber}`);
          await conversationsCollection.deleteOne({ _id: individual._id });
          stats.emptyConversationsDeleted++;
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

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ REPAIR COMPLETE");
    console.log(`   Groups processed: ${stats.groupsProcessed}`);
    console.log(`   rcConversationId backfilled: ${stats.rcConversationIdBackfilled}`);
    console.log(`   Duplicates removed: ${stats.duplicatesRemoved}`);
    console.log(`   Empty conversations deleted: ${stats.emptyConversationsDeleted}`);
    console.log(`   API calls made: ${stats.apiCalls}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error("❌ Repair error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}