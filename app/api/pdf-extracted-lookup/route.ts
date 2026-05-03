// app/api/pdf-extracted-lookup/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const policyNo = searchParams.get("policyNo")?.trim();
    const customerName = searchParams.get("customerName")?.trim();

    if (!policyNo && !customerName) {
      return NextResponse.json({ found: false });
    }

    const client = await clientPromise;
    const db = client.db("db");
    const collection = db.collection("pdf-extracted");

    let record = null;

    // 1. Try exact policy number match first
    if (policyNo) {
      record = await collection
        .findOne({ policyNumber: policyNo }, { sort: { updatedAt: -1 } });
    }

    // 2. Fall back to customer name match (case-insensitive)
    if (!record && customerName) {
      record = await collection
        .findOne(
          { customerName: { $regex: new RegExp(`^${customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
          { sort: { updatedAt: -1 } },
        );
    }

    if (!record) {
      return NextResponse.json({ found: false });
    }

    // Map paymentMethod → paymentType for the reminder system
    // paidInFull overrides everything
    let suggestedPaymentType: "regular" | "autopay" | "paid-in-full" = "regular";
    if (record.paidInFull) {
      suggestedPaymentType = "paid-in-full";
    } else if (record.paymentMethod === "cc" || record.paymentMethod === "eft") {
      suggestedPaymentType = "autopay";
    } else {
      // "none" = direct bill = regular manual payment
      suggestedPaymentType = "regular";
    }

    return NextResponse.json({
      found: true,
      paidInFull: record.paidInFull ?? false,
      nextDueDate: record.nextDueDate ?? null,      // "YYYY-MM-DD" or null
      monthlyAmount: record.monthlyAmount ?? null,
      paidAmount: record.paidAmount ?? null,
      companyName: record.companyName ?? null,
      paymentMethod: record.paymentMethod ?? null,
      suggestedPaymentType,
      mergedFilename: record.mergedFilename ?? null,
      updatedAt: record.updatedAt ?? null,
    });
  } catch (error) {
    console.error("pdf-extracted-lookup error:", error);
    return NextResponse.json({ found: false });
  }
}