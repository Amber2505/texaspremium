// app/api/validate-autopay-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const { customerPhone, paymentMethod } = body;

    if (!customerPhone || !paymentMethod) {
      return NextResponse.json(
        { error: "Phone and payment method required" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Find the most recent autopay link for this phone + method
    const link = await collection.findOne(
      {
        linkType: "autopay-only",
        customerPhone: customerPhone,
        paymentMethod: paymentMethod,
      },
      {
        sort: { createdAtTimestamp: -1 }, // Get most recent
      }
    );

    if (!link) {
      // No link found - allow autopay setup
      return NextResponse.json({
        disabled: false,
        allowed: true,
      });
    }

    // Check if disabled
    if (link.disabled === true) {
      return NextResponse.json({
        disabled: true,
        allowed: false,
        message: "This autopay setup link has been disabled",
      });
    }

    // Link exists and is not disabled
    return NextResponse.json({
      disabled: false,
      allowed: true,
    });
  } catch (error: unknown) {
    console.error("Error validating autopay link:", error);
    return NextResponse.json(
      { error: "Failed to validate link" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}