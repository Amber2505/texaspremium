import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { SDK } from "@ringcentral/sdk";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

async function getRingCentralClient() {
  const rcsdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();

  try {
    await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
    return platform;
  } catch (error) {
    console.error("RingCentral authentication failed:", error);
    throw new Error("Failed to authenticate with RingCentral");
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    
    let phoneNumber: string;
    let message: string;
    
    // Handle JSON requests (from the messaging interface)
    if (contentType?.includes('application/json')) {
      const body = await request.json();
      phoneNumber = body.to || body.phoneNumber;
      message = body.message;
    }
    // Handle FormData requests (from file upload interface)
    else if (contentType?.includes('multipart/form-data') || contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      phoneNumber = formData.get('phoneNumber') as string;
      message = formData.get('message') as string;
    }
    else {
      return NextResponse.json(
        { error: 'Content-Type must be application/json, multipart/form-data, or application/x-www-form-urlencoded' },
        { status: 400 }
      );
    }
    
    if (!phoneNumber || !message?.trim()) {
      return NextResponse.json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    // Validate phone number format
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    // Format phone number for RingCentral (add +1 if not present)
    const formattedPhone = cleaned.startsWith("1")
      ? `+${cleaned}`
      : `+1${cleaned}`;

    console.log(`📤 Sending message to ${formattedPhone}...`);

    // Send message via RingCentral
    const platform = await getRingCentralClient();
    const response = await platform.post("/restapi/v1.0/account/~/extension/~/sms", {
      from: { phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER },
      to: [{ phoneNumber: formattedPhone }],
      text: message,
    });

    const result = await response.json();
    console.log("✅ Message sent successfully:", result.id);

    // Save to MongoDB conversation
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    const messageObj = {
      id: result.id.toString(),
      direction: "Outbound",
      type: "SMS",
      subject: message,
      creationTime: new Date(result.creationTime).toISOString(),
      lastModifiedTime: new Date(result.lastModifiedTime).toISOString(),
      readStatus: "Read",
      messageStatus: "Sent",
      from: {
        phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER!,
      },
      to: [
        {
          phoneNumber: formattedPhone,
        },
      ],
      attachments: [],
    };

    // Add message to conversation
    await conversationsCollection.updateOne(
      { phoneNumber: formattedPhone },
      {
        $push: { 
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 }
          }
        },
        $set: {
          lastMessageTime: messageObj.creationTime,
          lastMessageId: result.id.toString(),
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { upsert: true }
    );

    console.log("💾 Message saved to conversation");

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
      messageId: result.id,
    });
  } catch (error: unknown) {
    console.error('❌ Send message error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}