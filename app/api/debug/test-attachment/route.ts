// app/api/debug/test-attachment/route.ts
import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

export async function GET() {
  const results: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    results.push(msg);
  };

  try {
    log("═══════════════════════════════════════════════════════════");
    log("🧪 [TEST] Starting attachment download test...");
    log("═══════════════════════════════════════════════════════════");

    // Step 1: Login to RingCentral
    log("\n📌 STEP 1: Login to RingCentral");
    const rcsdk = new SDK({
      server: RINGCENTRAL_SERVER,
      clientId: process.env.RINGCENTRAL_CLIENT_ID,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    });

    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
    log("✅ Logged in successfully");

    // Step 2: Get auth token
    log("\n📌 STEP 2: Get auth token");
    const authData = await platform.auth().data();
    const authToken = authData.access_token;
    log(`✅ Token: ${authToken ? authToken.substring(0, 40) + '...' : 'NULL'}`);

    if (!authToken) {
      log("❌ No auth token - cannot continue");
      return NextResponse.json({ success: false, results });
    }

    // Step 3: Fetch recent messages with attachments
    log("\n📌 STEP 3: Find a message with attachments");
    const dateFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const listResponse = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
      messageType: "SMS",
      dateFrom: dateFrom,
      perPage: 20,
    });
    const listData = await listResponse.json();
    
    // Find first inbound message with attachments
    const messageWithAttachment = listData.records?.find(
      (m: { direction: string; attachments?: unknown[] }) => 
        m.direction === "Inbound" && m.attachments && m.attachments.length > 0
    );

    if (!messageWithAttachment) {
      log("❌ No inbound messages with attachments found");
      return NextResponse.json({ success: false, results });
    }

    log(`✅ Found message ${messageWithAttachment.id} with ${messageWithAttachment.attachments.length} attachments`);
    log(`   From: ${messageWithAttachment.from?.phoneNumber}`);
    log(`   Subject: ${messageWithAttachment.subject}`);

    // Step 4: Fetch full message details
    log("\n📌 STEP 4: Fetch full message details");
    const fullMsgUrl = `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageWithAttachment.id}`;
    log(`   URL: ${fullMsgUrl}`);
    
    const fullMsgResponse = await fetch(fullMsgUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    log(`   Response status: ${fullMsgResponse.status}`);
    
    if (!fullMsgResponse.ok) {
      const errorText = await fullMsgResponse.text();
      log(`❌ Failed to fetch full message: ${errorText}`);
      return NextResponse.json({ success: false, results });
    }
    
    const fullMessage = await fullMsgResponse.json();
    log(`✅ Full message has ${fullMessage.attachments?.length || 0} attachments`);

    // Step 5: Examine attachments
    log("\n📌 STEP 5: Examine attachments");
    for (let i = 0; i < fullMessage.attachments.length; i++) {
      const att = fullMessage.attachments[i];
      log(`\n   Attachment ${i + 1}:`);
      log(`   - id: ${att.id}`);
      log(`   - type: ${att.type}`);
      log(`   - contentType: ${att.contentType}`);
      log(`   - uri: ${att.uri}`);
    }

    // Step 6: Find first media attachment
    log("\n📌 STEP 6: Find media attachment");
    const mediaAttachment = fullMessage.attachments.find(
      (a: { contentType?: string }) => 
        a.contentType?.startsWith('image/') ||
        a.contentType?.startsWith('audio/') ||
        a.contentType?.startsWith('video/')
    );

    if (!mediaAttachment) {
      log("❌ No media attachments found (only text)");
      log("   Available types: " + fullMessage.attachments.map((a: { contentType?: string }) => a.contentType).join(", "));
      return NextResponse.json({ success: false, results });
    }

    log(`✅ Found media attachment: ${mediaAttachment.contentType}`);

    // Step 7: Build download URL
    log("\n📌 STEP 7: Build download URL");
    // RingCentral URI is already complete - DO NOT append /content
    // Format: https://media.ringcentral.com/.../message-store/{msgId}/content/{attId}
    const downloadUrl = mediaAttachment.uri.startsWith('http') 
      ? mediaAttachment.uri 
      : `${RINGCENTRAL_SERVER}${mediaAttachment.uri}`;
    
    log(`   Original URI: ${mediaAttachment.uri}`);
    log(`   Download URL: ${downloadUrl}`);

    // Step 8: Download from RingCentral
    log("\n📌 STEP 8: Download from RingCentral");
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      }
    });

    log(`   Response status: ${downloadResponse.status}`);
    log(`   Content-Type: ${downloadResponse.headers.get('content-type')}`);
    log(`   Content-Length: ${downloadResponse.headers.get('content-length')}`);

    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      log(`❌ Download failed: ${errorText.substring(0, 200)}`);
      return NextResponse.json({ success: false, results });
    }

    const fileBuffer = await downloadResponse.arrayBuffer();
    log(`✅ Downloaded ${fileBuffer.byteLength} bytes`);

    // Check if we got JSON instead of binary (common error)
    const firstBytes = new Uint8Array(fileBuffer.slice(0, 10));
    const firstChars = String.fromCharCode(...firstBytes);
    log(`   First bytes: ${firstChars}`);
    
    if (firstChars.startsWith('{') || firstChars.startsWith('[')) {
      log(`⚠️ WARNING: Got JSON instead of binary data!`);
      const jsonText = new TextDecoder().decode(fileBuffer);
      log(`   JSON content: ${jsonText.substring(0, 200)}`);
    }

    // Step 9: Upload to Azure
    log("\n📌 STEP 9: Upload to Azure");
    const { azureStorage } = await import("@/lib/services/azureStorage");
    
    const filename = `test_${messageWithAttachment.id}_${mediaAttachment.id}.${mediaAttachment.contentType.split('/')[1]}`;
    log(`   Filename: ${filename}`);
    log(`   ContentType: ${mediaAttachment.contentType}`);
    
    // Test with direct buffer upload first
    log("   Calling azureStorage.downloadAndUpload...");
    
    const azureUrl = await azureStorage.downloadAndUpload(
      downloadUrl,
      filename,
      mediaAttachment.contentType,
      authToken
    );

    log(`   Azure URL result: ${azureUrl}`);

    if (azureUrl) {
      log(`\n✅ SUCCESS! Attachment saved to: ${azureUrl}`);
    } else {
      log(`\n❌ FAILED: Azure returned empty/null URL`);
    }

    log("\n═══════════════════════════════════════════════════════════");
    log("🧪 [TEST] Complete");
    log("═══════════════════════════════════════════════════════════");

    return NextResponse.json({ 
      success: !!azureUrl, 
      azureUrl,
      messageId: messageWithAttachment.id,
      attachmentId: mediaAttachment.id,
      results 
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    log(`\n❌ ERROR: ${errorMsg}`);
    log(`Stack: ${errorStack}`);
    
    return NextResponse.json({ 
      success: false, 
      error: errorMsg,
      results 
    });
  }
}