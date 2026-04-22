// app/api/save-merger-info/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(request: Request) {
  // Admin auth — verifies signed httpOnly cookie
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  let mongoClient: MongoClient | null = null;

  try {
    const body = await request.json();
    const {
      customerName,           // admin-entered (used for filename)
      policyNumber,           // extracted (REQUIRED to save)
      companyName,            // extracted (nullable)
      insuredNameFromPdf,     // extracted (nullable — may differ from admin-entered)
      effectiveDate,          // extracted (nullable)
      expirationDate,         // extracted (nullable)
      carrierFingerprint,   // ← ADD
      carrierLabel, 
      paidAmount,             // auto-extracted from receipt
      nextDueDate,            // admin-entered or PIF-computed (REQUIRED to save)
      monthlyAmount,          // admin-entered (or "0.00" for PIF)
      paidInFull,             // bool — PIF toggle
      policyType,             // "Auto", etc.
      nonOwner,               // bool
      paymentMethod,          // "cc" | "eft" | "none"
      receiptType,            // "card" | "cash"
      noReceipt,              // bool
      mergedFilename,         // the filename generated at merge time
    } = body;

    // Minimum data required to save: policy number + next due date
    if (!policyNumber || !nextDueDate) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: "Missing policy number or next due date — record not saved",
        },
        { status: 200 } // 200 because this is expected skip, not an error
      );
    }

    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection("pdf-merger-info-extracter");

    const now = new Date();

    const record = {
      customerName: customerName?.trim() || null,
      insuredNameFromPdf: insuredNameFromPdf || null,
      policyNumber: policyNumber.trim(),
      companyName: companyName || null,
      effectiveDate: effectiveDate || null,
      expirationDate: expirationDate || null,
      carrierFingerprint: carrierFingerprint || null,  // ← ADD
      carrierLabel: carrierLabel || null,     
      paidAmount: paidAmount || null,
      nextDueDate,
      monthlyAmount: monthlyAmount || null,
      paidInFull: !!paidInFull,
      policyType: policyType || null,
      nonOwner: !!nonOwner,
      paymentMethod: paymentMethod || null,
      receiptType: noReceipt ? "none" : receiptType || null,
      noReceipt: !!noReceipt,
      mergedFilename: mergedFilename || null,
      mergedAt: now,
      mergedAtTimestamp: now.getTime(),
    };

    const result = await collection.insertOne(record);

    await mongoClient.close();

    return NextResponse.json({
      success: true,
      id: result.insertedId.toString(),
    });
  } catch (err) {
    console.error("Save merger info error:", err);
    if (mongoClient) await mongoClient.close();
    return NextResponse.json(
      { success: false, error: "Failed to save merger info" },
      { status: 500 }
    );
  }
}