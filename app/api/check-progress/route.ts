// app/api/check-progress/route.ts
import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

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
    const collection = db.collection("payment_link_generated");

    // ✅ Find by MongoDB _id
    let link = null;

    if (ObjectId.isValid(linkId)) {
      link = await collection.findOne({ _id: new ObjectId(linkId) });
    }

    if (!link) {
      console.error("❌ Link not found for linkId:", linkId);
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    console.log("✅ Found link:", link._id);
    console.log("📊 completedStages:", link.completedStages);

    // Check if link is disabled
    if (link.disabled) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: "This link has been disabled",
      });
    }

    // ✅ Use YOUR field structure: completedStages
    const completedStages = link.completedStages || {};
    const paymentMethod = link.paymentMethod;
    const lang = link.language || "en";

    // Convert to simple boolean flags
    const progress = {
      payment: completedStages.payment === true,
      consent: completedStages.consent === true,
      autopay: completedStages.autopaySetup === true,
    };

    console.log("📊 Progress:", progress);

    // Determine next step
    let nextStep = "";
    let redirectTo = "";

    if (!progress.payment) {
      nextStep = "payment";
      redirectTo = link.squareLink;
      console.log("➡️ Next: Payment");
    } else if (!progress.consent) {
      nextStep = "consent";
      const cardLast4 = link.cardLast4 || "XXXX";
      const customerEmail = link.customerEmail || "";
      redirectTo = `/${lang}/sign-consent?linkId=${linkId}&amount=${(link.amount / 100).toFixed(2)}&card=${cardLast4}&email=${encodeURIComponent(customerEmail)}&method=${paymentMethod}&phone=${link.customerPhone}`;
      console.log("➡️ Next: Consent");
    } else if (!progress.autopay && paymentMethod !== "direct-bill") {
      nextStep = "autopay";
      redirectTo = `/${lang}/setup-autopay?${paymentMethod}&phone=${link.customerPhone}&redirect=payment&linkId=${linkId}`;
      console.log("➡️ Next: Autopay");
    } else {
      nextStep = "complete";
      redirectTo = `/${lang}/payment-thankyou`;
      console.log("➡️ Next: Complete / Thank You");
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
    console.error("❌ Error checking progress:", error);
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