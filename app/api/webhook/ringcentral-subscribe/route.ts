// app/api/webhook/ringcentral-subscribe/route.ts
/*eslint-disable @typescript-eslint/no-explicit-any*/
import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export async function POST() {
  try {
    const rcsdk = new SDK({
      server: "https://platform.ringcentral.com",
      clientId: process.env.RINGCENTRAL_CLIENT_ID,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    });

    const platform = rcsdk.platform();
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/ringcentral`;

    const response = await platform.post("/restapi/v1.0/subscription", {
      eventFilters: [
        "/restapi/v1.0/account/~/extension/~/message-store",
      ],
      deliveryMode: {
        transportType: "WebHook",
        address: webhookUrl,
      },
    });

    const data = await response.json();
    console.log("✅ Webhook subscription created:", data);

    return NextResponse.json({
      success: true,
      subscriptionId: data.id,
      status: data.status,
      expirationTime: data.expirationTime,
      webhookUrl,
    });
  } catch (err: any) {
    console.error("❌ Subscription error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}