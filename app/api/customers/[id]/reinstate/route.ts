// app/api/customers/[id]/reinstate/route.ts

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

type PaymentType = "regular" | "autopay" | "paid-in-full";

// Helper function to generate follow-ups based on payment type
function generateFollowUps(dueDateStr: string, paymentType: PaymentType) {
  const dueDate = new Date(dueDateStr);
  
  const addDays = (date: Date, days: number): string => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    const yyyy = result.getFullYear();
    const mm = String(result.getMonth() + 1).padStart(2, "0");
    const dd = String(result.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const followUps = [];

  if (paymentType === "regular") {
    followUps.push(
      {
        date: addDays(dueDate, -3),
        type: "pre-reminder",
        description: "Upcoming payment reminder",
        status: "pending",
        method: "sms",
      },
      {
        date: dueDateStr,
        type: "due-date",
        description: "Payment due today",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 5),
        type: "overdue",
        description: "Still unpaid - follow up",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 7),
        type: "overdue",
        description: "Second follow-up",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 9),
        type: "final",
        description: "Final reminder (last day)",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 12),
        type: "post-cancellation",
        description: "First reinstatement opportunity",
        status: "pending",
        method: "phone",
      },
      {
        date: addDays(dueDate, 14),
        type: "post-cancellation",
        description: "Second reinstatement opportunity",
        status: "pending",
        method: "phone",
      }
    );
  } else if (paymentType === "autopay") {
    followUps.push(
      {
        date: addDays(dueDate, -3),
        type: "pre-check",
        description: "Check autopay schedule",
        status: "pending",
        method: "sms",
      },
      {
        date: dueDateStr,
        type: "due-date",
        description: "Confirm autopay succeeded",
        status: "pending",
        method: "sms",
      },
      {
        date: addDays(dueDate, 7),
        type: "verification",
        description: "Verify payment posted correctly",
        status: "pending",
        method: "email",
      }
    );
  } else if (paymentType === "paid-in-full") {
    followUps.push({
      date: addDays(dueDate, -20),
      type: "renewal",
      description: "Check renewal pricing & inform",
      status: "pending",
      method: "phone",
    });
  }

  return followUps;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("=== REINSTATE API CALLED ===");
    
    const { id } = await params;
    console.log("1. Received ID:", id);
    console.log("2. ID type:", typeof id);
    
    const body = await req.json();
    const { dueDate, paymentType } = body;
    console.log("3. Request body:", { dueDate, paymentType });

    // Validate required fields
    if (!dueDate || !paymentType) {
      console.log("4. Validation failed: Missing fields");
      return NextResponse.json(
        { error: "Missing required fields: dueDate and paymentType" },
        { status: 400 }
      );
    }

    // Validate payment type
    const validPaymentTypes: PaymentType[] = ["regular", "autopay", "paid-in-full"];
    if (!validPaymentTypes.includes(paymentType)) {
      console.log("5. Validation failed: Invalid payment type");
      return NextResponse.json(
        { error: "Invalid payment type" },
        { status: 400 }
      );
    }

    console.log("6. Connecting to MongoDB...");
    const client = await clientPromise;
    const db = client.db("db");
    const collection = db.collection("payment_reminder_coll");
    console.log("7. Connected to database: payment_reminder_coll");

    // Find the customer
    console.log("8. Searching for customer with _id:", id);
    let objectId;
    try {
      objectId = new ObjectId(id);
      console.log("9. Created ObjectId:", objectId);
    } catch (error) {
      console.log("10. ERROR: Invalid ObjectId format:", error);
      return NextResponse.json(
        { error: "Invalid customer ID format" },
        { status: 400 }
      );
    }

    const customer = await collection.findOne({ _id: objectId });
    console.log("11. Customer found:", customer ? "YES" : "NO");
    
    if (customer) {
      console.log("12. Customer details:", {
        _id: customer._id,
        name: customer.name,
        status: customer.status,
      });
    }

    if (!customer) {
      console.log("13. ERROR: Customer not found in database");
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Check if customer is actually cancelled
    if (customer.status !== "cancelled") {
      console.log("14. ERROR: Customer is not cancelled, status:", customer.status);
      return NextResponse.json(
        { error: "Customer policy is not cancelled" },
        { status: 400 }
      );
    }

    console.log("15. Customer is cancelled, proceeding with reinstatement...");

    // Parse the new due date
    const newDueDate = new Date(dueDate);
    const paymentDayOfMonth = newDueDate.getDate();

    // Calculate remaining payments based on expiration date
    let remainingPayments = customer.remainingPayments;
    if (customer.expirationDate) {
      const expDate = new Date(customer.expirationDate);
      const monthsDiff = 
        (expDate.getFullYear() - newDueDate.getFullYear()) * 12 +
        (expDate.getMonth() - newDueDate.getMonth());
      remainingPayments = Math.max(1, monthsDiff);
    }

    console.log("16. Calculated values:", {
      paymentDayOfMonth,
      remainingPayments,
    });

    // Generate new follow-ups
    const followUps = generateFollowUps(dueDate, paymentType);
    console.log("17. Generated follow-ups:", followUps.length);

    // Update the customer
    console.log("18. Updating customer in database...");
    const result = await collection.updateOne(
      { _id: objectId },
      {
        $set: {
          status: "active",
          dueDate: dueDate,
          paymentDayOfMonth: paymentDayOfMonth,
          paymentType: paymentType,
          remainingPayments: remainingPayments,
          followUps: followUps,
          lastContact: new Date().toISOString().split("T")[0],
        },
        $unset: {
          cancellationDate: "",
          cancellationReason: "",
          winBackDate: "",
        },
      }
    );

    console.log("19. Update result:", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    if (result.modifiedCount === 0) {
      console.log("20. ERROR: Failed to update customer");
      return NextResponse.json(
        { error: "Failed to reinstate customer" },
        { status: 500 }
      );
    }

    // Fetch and return the updated customer
    const updatedCustomer = await collection.findOne({ _id: objectId });
    console.log("21. Fetched updated customer, status:", updatedCustomer?.status);
    console.log("22. SUCCESS: Customer reinstated");

    return NextResponse.json(
      {
        message: "Customer reinstated successfully",
        customer: updatedCustomer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("=== ERROR in reinstate route ===");
    console.error("Error details:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}