// app/api/check-progress/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json(
        { success: false, error: "Missing linkId" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_links");

    const link = await collection.findOne({ linkId });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    // Check if link is disabled
    if (link.disabled) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: "This link has been disabled",
      });
    }

    // Return progress and next step
    const progress = link.progress || {
      payment: false,
      consent: false,
      autopay: false,
    };

    const paymentMethod = link.paymentMethod;

    // Determine next step
    let nextStep = "";
    let redirectTo = "";

    if (!progress.payment) {
      nextStep = "payment";
      redirectTo = link.squareLink;
    } else if (!progress.consent) {
      nextStep = "consent";
      redirectTo = `/sign-consent?linkId=${linkId}&amount=${(link.amount / 100).toFixed(2)}&card=${link.cardLast4 || 'XXXX'}&email=${encodeURIComponent(link.customerEmail || '')}&method=${paymentMethod}&phone=${link.customerPhone}`;
    } else if (!progress.autopay && paymentMethod !== "direct-bill") {
      nextStep = "autopay";
      redirectTo = `/setup-autopay?${paymentMethod}&phone=${link.customerPhone}&redirect=payment&linkId=${linkId}`;
    } else {
      nextStep = "complete";
      redirectTo = "/payment-thankyou";
    }

    return NextResponse.json({
      success: true,
      progress,
      paymentMethod,
      nextStep,
      redirectTo,
      linkData: {
        amount: link.amount,
        description: link.description,
        customerPhone: link.customerPhone,
        customerEmail: link.customerEmail,
        language: link.language,
      },
    });
  } catch (error) {
    console.error("Error checking progress:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check progress" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}