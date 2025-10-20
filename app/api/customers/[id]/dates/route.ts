import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

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
    
    // Recalculate total payments based on new dates
    const yearDiff = expirationDate.getFullYear() - effectiveDate.getFullYear();
    const monthDiff = expirationDate.getMonth() - effectiveDate.getMonth();
    const dayDiff = expirationDate.getDate() - effectiveDate.getDate();
    
    let diffMonths = yearDiff * 12 + monthDiff;
    if (dayDiff < 0) {
      diffMonths -= 1;
    }
    
    const totalPayments = diffMonths >= 12 ? 12 : diffMonths;
    
    const client = await clientPromise;
    const db = client.db("db");

    // Update the payment_reminder_coll collection
    const result = await db.collection("payment_reminder_coll").updateOne(
      { id: id },
      {
        $set: {
          effectiveDate: effectiveDate.toISOString(),
          expirationDate: expirationDate.toISOString(),
          totalPayments: totalPayments,
          remainingPayments: totalPayments, // Reset remaining payments
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
      modifiedCount: result.modifiedCount,
      totalPayments: totalPayments
    });
  } catch (error) {
    console.error("Error updating dates:", error);
    return NextResponse.json(
      { error: "Failed to update dates", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}