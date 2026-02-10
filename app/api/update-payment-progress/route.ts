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

    // ✅ Find by _id (MongoDB ObjectId) first, then by linkId field
    let query = {};
    
    if (ObjectId.isValid(linkId)) {
      query = { _id: new ObjectId(linkId) };
    } else {
      query = { linkId: linkId };
    }

    // Get current link to check if we should mark as completed
    const link = await collection.findOne(query);

    if (!link) {
      console.error("❌ Link not found for linkId:", linkId);
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    console.log("✅ Found link, updating step:", step);

    // Update the specific progress step
    const updateData: any = {
      [`progress.${step}`]: true,
      [`timestamps.${step}`]: new Date(),
      updatedAt: new Date(),
    };

    // Check if this marks completion
    const progress = link.progress || {};
    const paymentMethod = link.paymentMethod;

    // Determine if all steps are complete
    let allComplete = false;

    if (step === "autopay") {
      // Autopay was just completed - mark as fully complete
      allComplete = true;
      updateData["timestamps.completed"] = new Date();
    } else if (step === "consent" && paymentMethod === "direct-bill") {
      // Direct-bill doesn't need autopay, so consent is the final step
      allComplete = true;
      updateData["timestamps.completed"] = new Date();
    }

    // Update MongoDB
    const result = await collection.updateOne(query, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to update progress" },
        { status: 500 }
      );
    }

    console.log(`✅ Updated ${step} progress for linkId: ${linkId}`);

    return NextResponse.json({
      success: true,
      message: `${step} marked as complete`,
      allComplete,
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