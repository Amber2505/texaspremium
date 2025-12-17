// app/api/messages/debug-groups/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    // Get all group conversations
    const groups = await conversationsCollection.find({ isGroup: true }).toArray();
    
    // Get all individual conversations
    const individuals = await conversationsCollection.find({ 
      $or: [
        { isGroup: false },
        { isGroup: { $exists: false } }
      ]
    }).toArray();

    const groupSummary = groups.map(g => ({
      conversationId: g.conversationId,
      rcConversationId: g.rcConversationId || "❌ NOT SET",
      participants: g.participants,
      messageCount: g.messages?.length || 0,
      lastMessage: g.messages?.[g.messages.length - 1]?.subject?.substring(0, 50) || "N/A",
      lastMessageRcConvId: g.messages?.[g.messages.length - 1]?.rcConversationId || "N/A",
    }));

    const individualSummary = individuals.map(i => ({
      conversationId: i.conversationId,
      phoneNumber: i.phoneNumber,
      rcConversationId: i.rcConversationId || "NOT SET",
      messageCount: i.messages?.length || 0,
      // Check if any messages have rcConversationId that matches a group
      messagesWithRcConvId: (i.messages || []).filter((m: {rcConversationId?: string}) => m.rcConversationId).length,
    }));

    // Find duplicates: messages that exist in both group and individual
    const duplicates: Array<{
      messageId: string;
      inGroup: string;
      inIndividual: string;
      from: string;
    }> = [];

    for (const group of groups) {
      const groupMessageIds = new Set((group.messages || []).map((m: {id: string}) => m.id));
      
      for (const individual of individuals) {
        for (const msg of (individual.messages || [])) {
          if (groupMessageIds.has(msg.id)) {
            duplicates.push({
              messageId: msg.id,
              inGroup: group.conversationId,
              inIndividual: individual.conversationId || individual.phoneNumber,
              from: msg.from?.phoneNumber || "unknown",
            });
          }
        }
      }
    }

    return NextResponse.json({
      summary: {
        totalGroups: groups.length,
        totalIndividuals: individuals.length,
        groupsWithRcConvId: groups.filter(g => g.rcConversationId).length,
        groupsWithoutRcConvId: groups.filter(g => !g.rcConversationId).length,
        duplicateMessages: duplicates.length,
      },
      groups: groupSummary,
      individuals: individualSummary.slice(0, 20), // Limit to 20
      duplicates: duplicates,
    });
  } catch (error: unknown) {
    console.error("Debug error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}