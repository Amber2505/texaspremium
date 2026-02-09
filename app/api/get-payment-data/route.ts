// app/api/get-payment-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentId = searchParams.get("id");

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: "Payment ID required" },
        { status: 400 }
      );
    }

    const db = await getDatabase("db");
    const paymentsCollection = db.collection("completed_payments");

    const payment = await paymentsCollection.findOne({ _id: new ObjectId(paymentId) });

    if (payment) {
      return NextResponse.json({
        success: true,
        payment: {
          amount: payment.amount,
          cardLast4: payment.cardLast4,
          customerEmail: payment.customerEmail,
          customerName: payment.customerName,
          customerPhone: payment.customerPhone,
          cardBrand: payment.cardBrand,
          language: payment.language,
          redirectMethod: payment.redirectMethod,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Payment not found - webhook may still be processing",
      });
    }
  } catch (error) {
    console.error("Error fetching payment data:", error);
    return NextResponse.json(
      { success: false, error: "Database error" },
      { status: 500 }
    );
  }
}