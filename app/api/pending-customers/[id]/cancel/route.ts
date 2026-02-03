import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { cancellationReason, cancellationDate, customWinBackDate } = body;

    console.log("📥 Received cancellation request for pending customer ID:", id);

    const client = await clientPromise;
    const db = client.db("db");

    // Get the pending customer from customer_policyandclaim_info
    const pendingCustomer = await db
      .collection("customer_policyandclaim_info")
      .findOne({ _id: new ObjectId(id) });

    if (!pendingCustomer) {
      console.log("❌ Pending customer not found with ID:", id);
      return NextResponse.json(
        { error: "Pending customer not found" },
        { status: 404 }
      );
    }

    console.log("✅ Found pending customer:", pendingCustomer.customer_name);

    // Parse cancellation date
    const cancellationDateObj = new Date(cancellationDate);
    
    // Generate win-back follow-ups based on cancellation reason
    const followUps = [];
    
    if (cancellationReason === "non-payment") {
      // Follow up at 3 & 6 months from cancellation date
      const threeMonthsLater = new Date(cancellationDateObj);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      
      const sixMonthsLater = new Date(cancellationDateObj);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      
      followUps.push(
        {
          date: threeMonthsLater.toISOString(),
          type: "win-back",
          description: "3-month win-back attempt (non-payment)",
          status: "pending",
          method: "phone",
        },
        {
          date: sixMonthsLater.toISOString(),
          type: "win-back",
          description: "6-month win-back attempt (non-payment)",
          status: "pending",
          method: "phone",
        }
      );
    } else if (cancellationReason === "customer-choice") {
      // Follow up 15 days before 6 months, then at 6 months
      const sixMonthsLater = new Date(cancellationDateObj);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      
      const fifteenDaysBefore = new Date(sixMonthsLater);
      fifteenDaysBefore.setDate(fifteenDaysBefore.getDate() - 15);
      
      followUps.push(
        {
          date: fifteenDaysBefore.toISOString(),
          type: "win-back",
          description: "Pre-renewal reminder (15 days before 6 months)",
          status: "pending",
          method: "phone",
        },
        {
          date: sixMonthsLater.toISOString(),
          type: "win-back",
          description: "6-month renewal opportunity",
          status: "pending",
          method: "phone",
        }
      );
    } else if (cancellationReason === "custom-date" && customWinBackDate) {
      // Follow up on custom date
      const customDate = new Date(customWinBackDate);
      
      followUps.push({
        date: customDate.toISOString(),
        type: "win-back",
        description: "Custom win-back date",
        status: "pending",
        method: "phone",
      });
    }
    // If "no-followup", followUps array stays empty

    // Create the cancelled customer record in payment_reminder_coll
    const cancelledCustomer = {
      id: pendingCustomer.policy_no,
      name: pendingCustomer.customer_name,
      dueDate: cancellationDateObj.toISOString(),
      paymentDayOfMonth: cancellationDateObj.getDate(),
      remainingPayments: 0,
      totalPayments: 0,
      effectiveDate: new Date(pendingCustomer.effective_date).toISOString(),
      expirationDate: new Date(pendingCustomer.expiration_date).toISOString(),
      companyName: pendingCustomer.company_name,
      coverageType: pendingCustomer.coverage_type,
      status: "cancelled",
      paymentType: "regular",
      followUps: followUps,
      cancellationDate: cancellationDateObj.toISOString(),
      cancellationReason: cancellationReason,
      winBackDate: cancellationReason === "custom-date" && customWinBackDate 
        ? new Date(customWinBackDate).toISOString() 
        : null,
    };

    console.log("💾 Creating cancelled customer record in payment_reminder_coll");

    // Insert into payment_reminder_coll
    await db.collection("payment_reminder_coll").insertOne(cancelledCustomer);

    console.log("✅ Successfully created cancelled customer record");

    return NextResponse.json({
      message: "Pending customer cancelled successfully",
      customer: cancelledCustomer,
    });
  } catch (error) {
    console.error("❌ Error cancelling pending customer:", error);
    return NextResponse.json(
      { error: "Failed to cancel pending customer" },
      { status: 500 }
    );
  }
}