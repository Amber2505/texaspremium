// app/api/debug/ringcentral-messages/route.ts
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

export async function GET() {
  try {
    console.log("🔍 [DEBUG] Fetching raw RingCentral messages...");
    
    const platform = await getRingCentralClient();
    
    // Fetch messages from last 2 hours
    const dateFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    // Try fetching with different message types
    console.log("\n📥 Fetching SMS messages...");
    const smsResponse = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 20,
    });
    const smsData = await smsResponse.json();
    
    console.log("\n📥 Fetching Pager (MMS) messages...");
    let mmsData = { records: [] };
    try {
      const mmsResponse = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
        messageType: "Pager",
        dateFrom: dateFrom,
        perPage: 20,
      });
      mmsData = await mmsResponse.json();
    } catch (e) {
      console.log(`${e} Pager type not available`);
    }
    
    // Log each message's details
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📋 SMS Messages:");
    console.log("═══════════════════════════════════════════════════════════");
    
    for (const msg of smsData.records || []) {
      console.log(`\n📨 Message ID: ${msg.id}`);
      console.log(`   Direction: ${msg.direction}`);
      console.log(`   Type: ${msg.type}`);
      console.log(`   From: ${msg.from?.phoneNumber}`);
      console.log(`   To: ${msg.to?.[0]?.phoneNumber}`);
      console.log(`   Subject: ${msg.subject?.substring(0, 50)}`);
      console.log(`   Created: ${msg.creationTime}`);
      console.log(`   Attachments Count: ${msg.attachments?.length || 0}`);
      
      if (msg.attachments && msg.attachments.length > 0) {
        console.log(`   📎 ATTACHMENTS:`);
        for (const att of msg.attachments) {
          console.log(`      - ID: ${att.id}`);
          console.log(`        Type: ${att.type}`);
          console.log(`        ContentType: ${att.contentType}`);
          console.log(`        URI: ${att.uri}`);
        }
      }
    }
    
    // Find the specific message
    const targetMessageId = "2545046842015";
    const targetMessage = smsData.records?.find((m: { id: number | string }) => 
      m.id?.toString() === targetMessageId
    );
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`🎯 Looking for message ${targetMessageId}:`);
    console.log("═══════════════════════════════════════════════════════════");
    
    if (targetMessage) {
      console.log("FOUND! Full message data:");
      console.log(JSON.stringify(targetMessage, null, 2));
    } else {
      console.log("NOT FOUND in recent messages");
      
      // Try to fetch it directly
      console.log("\n🔍 Trying to fetch message directly...");
      try {
        const directResponse = await platform.get(`/restapi/v1.0/account/~/extension/~/message-store/${targetMessageId}`);
        const directData = await directResponse.json();
        console.log("Direct fetch result:");
        console.log(JSON.stringify(directData, null, 2));
      } catch (e) {
        console.log("Direct fetch failed:", e);
      }
    }
    
    // Return summary
    return NextResponse.json({
      success: true,
      smsCount: smsData.records?.length || 0,
      mmsCount: mmsData.records?.length || 0,
      messagesWithAttachments: (smsData.records || []).filter(
        (m: { attachments?: unknown[] }) => m.attachments && m.attachments.length > 0
      ).map((m: { id: number | string; direction: string; type: string; attachments: unknown[] }) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        attachmentsCount: m.attachments.length,
      })),
      recentMessages: (smsData.records || []).slice(0, 5).map((m: { 
        id: number | string; 
        direction: string; 
        type: string; 
        subject?: string;
        creationTime: string;
        attachments?: unknown[];
        from?: { phoneNumber?: string };
      }) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        subject: m.subject?.substring(0, 30),
        creationTime: m.creationTime,
        attachmentsCount: m.attachments?.length || 0,
        from: m.from?.phoneNumber,
      })),
    });
  } catch (error) {
    console.error("❌ Debug error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}