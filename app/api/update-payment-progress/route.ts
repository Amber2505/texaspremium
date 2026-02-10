// app/api/update-progress/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(request: Request) {
  let client: MongoClient | null = null;

  try {
    const { linkId, step } = await request.json();

    console.log("🔄 Updating progress:", { linkId, step });

    // Validate inputs
    if (!linkId || !step) {
      return NextResponse.json(
        { success: false, error: "Missing linkId or step" },
        { status: 400 }
      );
    }

    // Validate step
    const validSteps = ["payment", "consent", "autopay"];
    if (!validSteps.includes(step)) {
      return NextResponse.json(
        { success: false, error: "Invalid step. Must be: payment, consent, or autopay" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // ✅ Find by MongoDB _id
    let query = {};
    
    if (ObjectId.isValid(linkId)) {
      query = { _id: new ObjectId(linkId) };
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid linkId format" },
        { status: 400 }
      );
    }

    // Get current link
    const link = await collection.findOne(query);

    if (!link) {
      console.error("❌ Link not found for linkId:", linkId);
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    console.log("✅ Found link, current stages:", link.completedStages);

    // ✅ Map step names to YOUR field names
    const stepFieldMap: Record<string, string> = {
      payment: "payment",
      consent: "consent",
      autopay: "autopaySetup", // ✅ You use "autopaySetup" not "autopay"
    };

    const fieldName = stepFieldMap[step];

    // Update the specific stage
    const updateData: any = {
      [`completedStages.${fieldName}`]: true,
      [`timestamps.${fieldName}`]: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentStage: step, // ✅ Update currentStage too
    };

    const paymentMethod = link.paymentMethod;

    // Determine if all steps are complete
    if (step === "autopay") {
      // Autopay completed - mark as fully complete
      updateData["timestamps.completed"] = new Date().toISOString();
      updateData["currentStage"] = "complete";
    } else if (step === "consent" && paymentMethod === "direct-bill") {
      // Direct-bill doesn't need autopay
      updateData["timestamps.completed"] = new Date().toISOString();
      updateData["currentStage"] = "complete";
    }

    console.log("📝 Updating with:", updateData);

    // Update MongoDB
    const result = await collection.updateOne(query, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to update progress" },
        { status: 500 }
      );
    }

    console.log(`✅ Updated ${step} progress for linkId: ${linkId}`);

    // Fetch updated document to verify
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