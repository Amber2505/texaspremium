import { NextRequest, NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

const rcsdk = new SDK({
  server: "https://platform.ringcentral.com",
  clientId: process.env.RINGCENTRAL_CLIENT_ID!,
  clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
});

export async function POST(request: NextRequest) {
  try {
    const { messageIds } = await request.json();

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: "Message IDs are required" },
        { status: 400 }
      );
    }

    // Authenticate with RingCentral
    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT! });

    // ✅ CRITICAL FIX: Only mark the LAST (most recent) message as unread
    // This avoids rate limiting and is how most messaging apps work
    const lastMessageId = messageIds[messageIds.length - 1];
    
    console.log(`📬 Marking only the last message (${lastMessageId}) as unread on RingCentral`);
    console.log(`   Skipping ${messageIds.length - 1} older messages to avoid rate limiting`);

    try {
      const response = await platform.put(
        `/restapi/v1.0/account/~/extension/~/message-store/${lastMessageId}`,
        {
          readStatus: "Unread",
        }
      );

      await response.json();
      console.log(`✅ Successfully marked last message ${lastMessageId} as unread on RingCentral`);

      return NextResponse.json({
        success: true,
        markedUnread: 1,
        skipped: messageIds.length - 1,
        total: messageIds.length,
        message: `Marked last message as unread (conversation will show as unread)`,
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`❌ Failed to mark message ${lastMessageId} as unread:`, err.message);
      
      return NextResponse.json(
        { 
          error: err.message || "Failed to mark message as unread",
          success: false 
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("❌ Error marking message as unread on RingCentral:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to mark message as unread" },
      { status: 500 }
    );
  }
}