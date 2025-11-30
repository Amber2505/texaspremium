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

    console.log(`📬 Marking ${messageIds.length} messages as unread on RingCentral...`);

    // Mark each message as unread on RingCentral
    const results = await Promise.allSettled(
      messageIds.map(async (messageId) => {
        try {
          const response = await platform.put(
            `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
            {
              readStatus: "Unread",
            }
          );

          const data = await response.json();
          console.log(`✅ Marked message ${messageId} as unread on RingCentral`);
          return data;
        } catch (error: unknown) {
          const err = error as { message?: string };
          console.error(`❌ Failed to mark message ${messageId} as unread:`, err.message);
          throw error;
        }
      })
    );

    // Check if all succeeded
    const failures = results.filter((r) => r.status === "rejected");
    const successes = results.filter((r) => r.status === "fulfilled");

    console.log(`✅ Successfully marked ${successes.length}/${messageIds.length} messages as unread on RingCentral`);

    if (failures.length > 0) {
      console.warn(`⚠️  ${failures.length} messages failed to mark as unread`);
    }

    return NextResponse.json({
      success: true,
      markedUnread: successes.length,
      failed: failures.length,
      total: messageIds.length,
    });
  } catch (error: unknown) {
    console.error("❌ Error marking messages as unread on RingCentral:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to mark messages as unread" },
      { status: 500 }
    );
  }
}