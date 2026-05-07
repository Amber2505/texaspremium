// api/smart-pdf-lookup/route.ts

import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const policyNo = searchParams.get("policyNo");
  const customerName = searchParams.get("customerName");

  if (!policyNo && !customerName) {
    return NextResponse.json({ found: false });
  }

  try {
    const client = await clientPromise;
    const db = client.db("db");

    // Step 1: Find in pdf-extracted by policyNumber or customerName
    const pdfQuery = policyNo
      ? { policyNumber: policyNo }
      : { customerName: { $regex: new RegExp(`^${customerName}$`, "i") } };

    const pdfRecord = await db.collection("pdf-extracted").findOne(pdfQuery);
    console.log("📄 pdfRecord:", pdfRecord ? `found (policyNumber: ${pdfRecord.policyNumber})` : "NOT FOUND");
    console.log("📄 pdfQuery was:", JSON.stringify(pdfQuery));

    if (!pdfRecord) {
      return NextResponse.json({ found: false });
    }

    console.log("📄 paidInFull:", pdfRecord.paidInFull);
    console.log("📄 nextDueDate:", pdfRecord.nextDueDate);

    // Step 2: Get phone + dates from customer_policyandclaim_info
    const policyInfo = await db
      .collection("customer_policyandclaim_info")
      .findOne({ policy_no: policyNo });

    let suggestedPaymentType: "regular" | "autopay" | "paid-in-full" = "regular";

    // If paid in full, done
    if (pdfRecord.paidInFull) {
      suggestedPaymentType = "paid-in-full";
    } else if (policyInfo?.phone) {
      // Step 3: Check autopay_customers by phone within policy date range
      // Use start of effective day so autopay cards set up same day aren't excluded
      const effectiveDate = policyInfo.effective_date
        ? new Date(new Date(policyInfo.effective_date).toISOString().split("T")[0])
        : null;
      const expirationDate = policyInfo.expiration_date
        ? new Date(new Date(policyInfo.expiration_date).toISOString().split("T")[0] + "T23:59:59.999Z")
        : null;

      if (effectiveDate && expirationDate) {
        const autopayRecord = await db
          .collection("autopay_customers")
          .findOne({
            customerPhone: policyInfo.phone,
            status: "active",
            completed: true,
            $expr: {
              $and: [
                { $gte: [{ $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, effectiveDate.toISOString().split("T")[0]] },
                { $lte: [{ $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, expirationDate.toISOString().split("T")[0]] },
              ]
            }
          });

        console.log("🔑 autopayRecord:", autopayRecord ? `found (phone: ${policyInfo.phone})` : "NOT FOUND");
        console.log("🔑 date range used:", effectiveDate?.toISOString().split("T")[0], "to", expirationDate?.toISOString().split("T")[0]);
        if (autopayRecord) {
          suggestedPaymentType = "autopay";
        }
      } else {
        // No date range — just check if any active autopay exists for phone
        const autopayRecord = await db
          .collection("autopay_customers")
          .findOne({ customerPhone: policyInfo.phone, status: "active", completed: true });

        if (autopayRecord) {
          suggestedPaymentType = "autopay";
        }
      }
    } else if (pdfRecord.paymentMethod === "cc" || pdfRecord.paymentMethod === "eft") {
      // Fallback: use paymentMethod from pdf if no phone found
      suggestedPaymentType = "autopay";
    }

    return NextResponse.json({
      found: true,
      paidInFull: pdfRecord.paidInFull ?? false,
      nextDueDate: pdfRecord.nextDueDate ?? null,
      monthlyAmount: pdfRecord.monthlyAmount ?? null,
      paidAmount: pdfRecord.paidAmount ?? null,
      companyName: pdfRecord.companyName ?? null,
      paymentMethod: pdfRecord.paymentMethod ?? null,
      suggestedPaymentType,
      mergedFilename: pdfRecord.mergedFilename ?? null,
      updatedAt: pdfRecord.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Smart PDF lookup error:", error);
    return NextResponse.json({ found: false });
  }
}