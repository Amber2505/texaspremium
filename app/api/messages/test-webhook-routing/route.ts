// app/api/messages/test-webhook-routing/route.ts
// Test the webhook routing logic locally without needing actual webhook
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { SDK } from "@ringcentral/sdk";

export const dynamic = "force-dynamic";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

function normalizePhone(phone: string): string {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

// GET: Test with a specific message ID from RingCentral
// Usage: /api/messages/test-webhook-routing?messageId=2554673629015
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    
    if (!messageId) {
      return NextResponse.json({ 
        error: "Missing messageId parameter",
        usage: "/api/messages/test-webhook-routing?messageId=YOUR_MESSAGE_ID",
        tip: "Get a message ID from your group conversation in MongoDB"
      }, { status: 400 });
    }

    console.log("\n\n");
    console.log("████████████████████████████████████████████████████████████");
    console.log("█         TEST WEBHOOK ROUTING (LOCAL)                     █");
    console.log("████████████████████████████████████████████████████████████");
    console.log(`\n📧 Testing with message ID: ${messageId}`);

    // ══════════════════════════════════════════════════════════════════
    // STEP 1: Get RingCentral auth
    // ══════════════════════════════════════════════════════════════════
    console.log(`\n🔐 STEP 1: Getting RC auth...`);
    
    let authToken: string | null = null;
    try {
      const rcsdk = new SDK({
        server: RINGCENTRAL_SERVER,
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
      });
      const platform = rcsdk.platform();
      await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
      const authData = await platform.auth().data();
      authToken = authData.access_token || null;
      console.log(`   ✅ Got auth token`);
    } catch (e) {
      console.error(`   ❌ Auth failed:`, e);
      return NextResponse.json({ error: "RC Auth failed", details: String(e) }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 2: Fetch full message from RC API
    // ══════════════════════════════════════════════════════════════════
    console.log(`\n🔍 STEP 2: Fetching message ${messageId} from RC API...`);
    
    let rcMessage: {
      id?: string;
      direction?: string;
      from?: { phoneNumber?: string };
      to?: Array<{ phoneNumber?: string }>;
      subject?: string;
      conversation?: { id?: string };
    } | null = null;
    
    try {
      const response = await fetch(
        `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
        { headers: { 'Authorization': `Bearer ${authToken}` } }
      );
      
      console.log(`   Response status: ${response.status}`);
      
      if (response.ok) {
        rcMessage = await response.json();
        console.log(`   ✅ Got message from API`);
        console.log(`   Direction: ${rcMessage?.direction}`);
        console.log(`   From: ${rcMessage?.from?.phoneNumber}`);
        console.log(`   To: [${rcMessage?.to?.map(t => t.phoneNumber).join(', ')}]`);
        console.log(`   Subject: ${rcMessage?.subject?.substring(0, 50)}`);
        console.log(`   ⭐ conversation.id: "${rcMessage?.conversation?.id || 'NOT SET'}"`);
      } else {
        const errorText = await response.text();
        console.log(`   ❌ API returned ${response.status}: ${errorText}`);
        return NextResponse.json({ 
          error: `RC API error: ${response.status}`, 
          details: errorText 
        }, { status: 500 });
      }
    } catch (e) {
      console.error(`   ❌ Fetch error:`, e);
      return NextResponse.json({ error: "Failed to fetch from RC", details: String(e) }, { status: 500 });
    }

    const rcConversationId = rcMessage?.conversation?.id?.toString() || "";
    const fromNumber = rcMessage?.from?.phoneNumber || "";
    const normalizedFrom = normalizePhone(fromNumber);

    // ══════════════════════════════════════════════════════════════════
    // STEP 3: MongoDB lookup by rcConversationId
    // ══════════════════════════════════════════════════════════════════
    console.log(`\n🗄️ STEP 3: MongoDB lookup...`);
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    let routingResult: {
      method: string;
      conversationId: string;
      isGroup: boolean;
      participants: string[];
      matchedDoc?: {
        _id: string;
        conversationId: string;
        rcConversationId: string;
        isGroup: boolean;
      };
    } = {
      method: "NEW_INDIVIDUAL",
      conversationId: normalizedFrom,
      isGroup: false,
      participants: [normalizedFrom],
    };

    if (rcConversationId) {
      console.log(`   Looking for rcConversationId: "${rcConversationId}"`);
      
      // Query MongoDB
      const found = await conversationsCollection.findOne({
        rcConversationId: rcConversationId
      });
      
      if (found) {
        console.log(`   ✅ FOUND MATCH!`);
        console.log(`      _id: ${found._id}`);
        console.log(`      conversationId: ${found.conversationId}`);
        console.log(`      isGroup: ${found.isGroup}`);
        console.log(`      participants: [${(found.participants || []).join(', ')}]`);
        console.log(`      stored rcConversationId: "${found.rcConversationId}"`);
        
        routingResult = {
          method: found.isGroup ? "MATCHED_GROUP" : "MATCHED_INDIVIDUAL",
          conversationId: found.conversationId || normalizedFrom,
          isGroup: found.isGroup || false,
          participants: found.participants || [normalizedFrom],
          matchedDoc: {
            _id: found._id.toString(),
            conversationId: found.conversationId,
            rcConversationId: found.rcConversationId,
            isGroup: found.isGroup,
          }
        };
      } else {
        console.log(`   ❌ NO MATCH FOUND for rcConversationId: "${rcConversationId}"`);
        
        // List all groups
        const allGroups = await conversationsCollection.find({ isGroup: true }).toArray();
        console.log(`\n   📋 All groups in DB (${allGroups.length}):`);
        
        const groupList = allGroups.map(g => ({
          conversationId: g.conversationId,
          rcConversationId: g.rcConversationId || "NOT SET",
          matches: g.rcConversationId === rcConversationId ? "⭐ SHOULD MATCH" : ""
        }));
        
        for (const g of groupList) {
          console.log(`      - ${g.conversationId}`);
          console.log(`        rcConvId: "${g.rcConversationId}" ${g.matches}`);
        }
      }
    } else {
      console.log(`   ⚠️ No rcConversationId from RC API`);
    }

    console.log(`\n📍 ROUTING DECISION: ${routingResult.method}`);
    console.log(`   → Would save to: ${routingResult.conversationId}`);
    console.log(`   → isGroup: ${routingResult.isGroup}`);

    console.log("\n████████████████████████████████████████████████████████████\n");

    // Return results
    return NextResponse.json({
      success: true,
      messageId: messageId,
      rcMessage: {
        direction: rcMessage?.direction,
        from: rcMessage?.from?.phoneNumber,
        to: rcMessage?.to?.map(t => t.phoneNumber),
        subject: rcMessage?.subject?.substring(0, 100),
        rcConversationId: rcConversationId || "NOT SET",
      },
      routing: routingResult,
      conclusion: routingResult.method === "MATCHED_GROUP" 
        ? "✅ Would route to GROUP correctly!" 
        : routingResult.method === "MATCHED_INDIVIDUAL"
        ? "✅ Would route to existing individual"
        : `⚠️ Would create NEW individual (rcConversationId ${rcConversationId ? 'not found in DB' : 'not provided by RC'})`
    });

  } catch (error: unknown) {
    console.error("❌ Test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}