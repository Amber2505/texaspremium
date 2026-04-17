// app/api/update-progress/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

// ✅ Helper: accepts both publicLinkId and legacy ObjectId
function buildLinkQuery(linkId: string) {
  if (/^[a-f0-9]{32}$/i.test(linkId)) {
    return { publicLinkId: linkId };
  }
  if (linkId.length === 24 && ObjectId.isValid(linkId)) {
    return { _id: new ObjectId(linkId) };
  }
  return null;
}

export async function POST(request: Request) {
  let client: MongoClient | null = null;

  try {
    const { linkId, step } = await request.json();

    console.log("🔄 Updating progress:", { linkId, step });

    if (!linkId || !step) {
      return NextResponse.json(
        { success: false, error: "Missing linkId or step" },
        { status: 400 }
      );
    }

    const validSteps = ["payment", "consent", "autopay"];
    if (!validSteps.includes(step)) {
      return NextResponse.json(
        { success: false, error: "Invalid step. Must be: payment, consent, or autopay" },
        { status: 400 }
      );
    }

    const query = buildLinkQuery(linkId);
    if (!query) {
      return NextResponse.json(
        { success: false, error: "Invalid linkId format" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    const link = await collection.findOne(query);

    if (!link) {
      console.error("❌ Link not found for linkId:", linkId);
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    console.log("✅ Found link, current stages:", link.completedStages);

    const stepFieldMap: Record<string, string> = {
      payment: "payment",
      consent: "consent",
      autopay: "autopaySetup",
    };

    const fieldName = stepFieldMap[step];

    const updateData: any = {
      [`completedStages.${fieldName}`]: true,
      [`timestamps.${fieldName}`]: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentStage: step,
    };

    const paymentMethod = link.paymentMethod;

    if (step === "autopay") {
      updateData["timestamps.completed"] = new Date().toISOString();
      updateData["currentStage"] = "complete";
    } else if (step === "consent" && paymentMethod === "direct-bill") {
      updateData["timestamps.completed"] = new Date().toISOString();
      updateData["currentStage"] = "complete";
    }

    console.log("📝 Updating with:", updateData);

    const result = await collection.updateOne(query, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to update progress" },
        { status: 500 }
      );
    }

    console.log(`✅ Updated ${step} progress for linkId: ${linkId}`);

    // Notify Railway to broadcast to admin clients
    try {
      await fetch(`${process.env.NEXT_PUBLIC_RAILWAY_URL}/notify/payment-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
    } catch (e) {
      console.log("Could not notify Railway of progress update");
    }

    const updatedLink = await collection.findOne(query);
    console.log("✅ Updated completedStages:", updatedLink?.completedStages);

    return NextResponse.json({
      success: true,
      message: `${step} marked as complete`,
      completedStages: updatedLink?.completedStages,
    });
  } catch (error) {
    console.error("❌ Error updating progress:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update progress" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}