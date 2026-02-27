// app/api/messages/mark-read-ringcentral/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SDK } from '@ringcentral/sdk';

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

async function getRingCentralClient() {
  const sdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID!,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
  });

  await sdk.platform().login({ jwt: process.env.RINGCENTRAL_JWT! });
  return sdk.platform();
}

export async function POST(request: NextRequest) {
  try {
    const { messageIds } = await request.json();

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const platform = await getRingCentralClient();

    // Process in batches of 5 with 300ms delay between batches
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (id: string) => {
          await platform.patch(
            `/restapi/v1.0/account/~/extension/~/message-store/${id}`,
            { readStatus: "Read" }
          );
          return id;
        })
      );

      successCount += results.filter(r => r.status === "fulfilled").length;
      failCount += results.filter(r => r.status === "rejected").length;

      // Wait between batches (skip delay after last batch)
      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    console.log(`✅ Marked ${successCount} messages as read on RingCentral (${failCount} failed)`);

    return NextResponse.json({ success: true, marked: successCount, failed: failCount });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Failed to mark as read on RingCentral:", err.message);
    return NextResponse.json({ error: "Failed to sync read status" }, { status: 500 });
  }
}