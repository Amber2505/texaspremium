// app/api/messages/test-rc-json/route.ts
// Hit this route to see exactly what RingCentral returns
import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

export async function GET() {
  try {
    console.log("\n\n");
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║     FETCHING RINGCENTRAL MESSAGES - RAW JSON                   ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // Auth
    const rcsdk = new SDK({
      server: RINGCENTRAL_SERVER,
      clientId: process.env.RINGCENTRAL_CLIENT_ID,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    });

    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
    
    const authData = await platform.auth().data();
    const authToken = authData.access_token;

    // Fetch last 2 hours of messages
    const dateFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const response = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 20,
    });

    const data = await response.json();
    const messages = data.records || [];

    console.log(`Found ${messages.length} messages\n`);

    // Print first 5 messages from LIST API
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📋 LIST API RESPONSE (first 5 messages):");
    console.log("═══════════════════════════════════════════════════════════════\n");
    
    const listMessages = messages.slice(0, 5).map((msg: {
      id?: number;
      direction?: string;
      from?: { phoneNumber?: string };
      to?: Array<{ phoneNumber?: string }>;
      subject?: string;
      creationTime?: string;
      conversation?: { id?: number };
      type?: string;
    }) => ({
      id: msg.id,
      direction: msg.direction,
      from: msg.from?.phoneNumber,
      to: msg.to?.map(t => t.phoneNumber),
      subject: msg.subject?.substring(0, 50),
      creationTime: msg.creationTime,
      conversationId: msg.conversation?.id,
      type: msg.type,
    }));

    console.log(JSON.stringify(listMessages, null, 2));

    // Fetch FULL details for first inbound message
    const firstInbound = messages.find((m: { direction?: string }) => m.direction === "Inbound");
    
    let fullMessageJson = null;
    
    if (firstInbound && authToken) {
      console.log("\n═══════════════════════════════════════════════════════════════");
      console.log("📨 INDIVIDUAL MESSAGE API (first inbound):");
      console.log("═══════════════════════════════════════════════════════════════\n");
      
      const fullResp = await fetch(
        `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${firstInbound.id}`,
        { headers: { 'Authorization': `Bearer ${authToken}` } }
      );
      
      if (fullResp.ok) {
        fullMessageJson = await fullResp.json();
        console.log(JSON.stringify(fullMessageJson, null, 2));
      }
    }

    console.log("\n════════════════════════════════════════════════════════════════\n");

    return NextResponse.json({
      success: true,
      totalMessages: messages.length,
      listApiSample: listMessages,
      fullMessageSample: fullMessageJson,
      importantFields: {
        note: "Look at the 'to' field - does it include ALL group participants?",
        fromListApi: {
          to: listMessages[0]?.to,
          conversationId: listMessages[0]?.conversationId,
        },
        fromFullApi: fullMessageJson ? {
          to: fullMessageJson.to?.map((t: { phoneNumber?: string }) => t.phoneNumber),
          conversationId: fullMessageJson.conversation?.id,
        } : null,
      }
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}