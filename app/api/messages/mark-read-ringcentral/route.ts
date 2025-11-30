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

    const results = await Promise.allSettled(
      messageIds.map(async (id: string) => {
        await platform.patch(`/restapi/v1.0/account/~/extension/~/message-store/${id}`, {
          readStatus: "Read"
        });
        return { id, status: "success" };
      })
    );

    const success = results.filter(r => r.status === "fulfilled");
    const failed = results.filter(r => r.status === "rejected");

    console.log(`Marked ${success.length} messages as read on RingCentral`);

    return NextResponse.json({
      success: true,
      marked: success.length,
      failed: failed.length
    });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Failed to mark as read on RingCentral:", err.message);
    return NextResponse.json(
      { error: "Failed to sync read status" },
      { status: 500 }
    );
  }
}