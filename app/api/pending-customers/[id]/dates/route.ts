import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { effective_date, expiration_date } = await request.json();
    
    console.log("Updating customer dates:", { id, effective_date, expiration_date });
    
    // Parse dates and set to noon UTC to avoid timezone issues
    const effectiveDate = new Date(effective_date);
    effectiveDate.setUTCHours(12, 0, 0, 0);
    
    const expirationDate = new Date(expiration_date);
    expirationDate.setUTCHours(12, 0, 0, 0);
    
    const client = await clientPromise;
    const db = client.db("db");

    // Update the customer_policyandclaim_info collection
    const result = await db.collection("customer_policyandclaim_info").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          effective_date: effectiveDate,
          expiration_date: expirationDate,
          last_updated: new Date(),
        },
      }
    );

    console.log("Update result:", result);

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: "Dates updated successfully",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating dates:", error);
    return NextResponse.json(
      { error: "Failed to update dates", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}