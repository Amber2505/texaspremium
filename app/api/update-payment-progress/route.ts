// app/api/update-payment-progress/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { linkId, stage } = await request.json();

    if (!linkId || !stage) {
      return NextResponse.json(
        { success: false, error: "Missing linkId or stage" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("texas_premium");

    // Update the payment link with the current stage
    const result = await db.collection("payment_links").updateOne(
      { _id: linkId },
      {
        $set: {
          currentStage: stage,
          [`completedStages.${stage}`]: true,
          [`timestamps.${stage}`]: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Progress updated successfully",
    });
  } catch (error) {
    console.error("Error updating payment progress:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update progress" },
      { status: 500 }
    );
  }
}