// app/api/messages/debug-rc-ids/route.ts
// Checks if inbound replies have the same rcConversationId as outbound group messages
import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

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

async function fetchMessageDetails(messageId: string, authToken: string) {
  try {
    const response = await fetch(
      `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      id: data.id,
      direction: data.direction,
      conversationId: data.conversation?.id?.toString() || null,
      from: data.from?.phoneNumber,
      to: data.to?.map((t: {phoneNumber?: string}) => t.phoneNumber),
      subject: data.subject?.substring(0, 50),
      creationTime: data.creationTime,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    const authToken = await getRingCentralAuth();
    if (!authToken) {
      return NextResponse.json({ error: "Failed to get RC auth" }, { status: 500 });
    }

    // Get all groups
    const groups = await conversationsCollection.find({ isGroup: true }).toArray();
    
    const results = [];
    
    for (const group of groups) {
      const messages = group.messages || [];
      
      // Find outbound and inbound messages
      const outboundMsgs = messages.filter((m: {direction?: string}) => m.direction === "Outbound").slice(0, 2);
      const inboundMsgs = messages.filter((m: {direction?: string}) => m.direction === "Inbound").slice(0, 2);
      
      const groupResult: {
        conversationId: string;
        storedRcConversationId: string;
        participants: string[];
        outboundMessages: Array<{id: string; rcConversationId: string | null; from: string; to: string[]; subject: string}>;
        inboundMessages: Array<{id: string; rcConversationId: string | null; from: string; to: string[]; subject: string}>;
        analysis: string;
      } = {
        conversationId: group.conversationId,
        storedRcConversationId: group.rcConversationId || "NOT SET",
        participants: group.participants,
        outboundMessages: [],
        inboundMessages: [],
        analysis: "",
      };
      
      // Fetch RC details for outbound messages
      for (const msg of outboundMsgs) {
        if (msg.id) {
          const details = await fetchMessageDetails(msg.id, authToken);
          if (details) {
            groupResult.outboundMessages.push({
              id: msg.id,
              rcConversationId: details.conversationId,
              from: details.from,
              to: details.to,
              subject: details.subject,
            });
          }
          await new Promise(r => setTimeout(r, 100)); // Rate limit
        }
      }
      
      // Fetch RC details for inbound messages
      for (const msg of inboundMsgs) {
        if (msg.id) {
          const details = await fetchMessageDetails(msg.id, authToken);
          if (details) {
            groupResult.inboundMessages.push({
              id: msg.id,
              rcConversationId: details.conversationId,
              from: details.from,
              to: details.to,
              subject: details.subject,
            });
          }
          await new Promise(r => setTimeout(r, 100)); // Rate limit
        }
      }
      
      // Analyze
      const outboundIds = new Set(groupResult.outboundMessages.map(m => m.rcConversationId).filter(Boolean));
      const inboundIds = new Set(groupResult.inboundMessages.map(m => m.rcConversationId).filter(Boolean));
      
      if (outboundIds.size === 0 && inboundIds.size === 0) {
        groupResult.analysis = "No messages to analyze";
      } else if (outboundIds.size === 0) {
        groupResult.analysis = "No outbound messages - cannot compare";
      } else if (inboundIds.size === 0) {
        groupResult.analysis = "No inbound messages - cannot compare";
      } else {
        const outboundId = [...outboundIds][0];
        const allInboundMatch = [...inboundIds].every(id => id === outboundId);
        
        if (allInboundMatch) {
          groupResult.analysis = "✅ MATCH - Inbound rcConversationId matches outbound!";
        } else {
          groupResult.analysis = `❌ MISMATCH - Outbound: ${[...outboundIds].join(',')} vs Inbound: ${[...inboundIds].join(',')}`;
        }
      }
      
      results.push(groupResult);
    }

    return NextResponse.json({
      totalGroups: groups.length,
      results: results,
      summary: {
        matching: results.filter(r => r.analysis.includes("✅")).length,
        mismatching: results.filter(r => r.analysis.includes("❌")).length,
        noData: results.filter(r => !r.analysis.includes("✅") && !r.analysis.includes("❌")).length,
      }
    });
  } catch (error: unknown) {
    console.error("Debug error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}