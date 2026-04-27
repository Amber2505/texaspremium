// app/api/pdf-extracted/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  let mongoClient: MongoClient | null = null;

  try {
    const body = await request.json();

    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection("pdf-extracted");

    // Drop any stale unique index left over from a previous schema
    await collection.dropIndex("carrierFingerprint_1").catch(() => { /* already gone */ });

    const policyNumber = body.policyNumber || null;

    const fields = {
      customerName: body.customerName || null,
      policyNumber,
      companyName: body.companyName || null,
      paidAmount: body.paidAmount || null,
      paidInFull: body.paidInFull ?? false,
      nextDueDate: body.paidInFull ? null : (body.nextDueDate || null),
      monthlyAmount: body.paidInFull ? "0.00" : (body.monthlyAmount || null),
      policyType: body.policyType || null,
      nonOwner: body.nonOwner ?? false,
      paymentMethod: body.paymentMethod || null,
      receiptType: body.receiptType || null,
      noReceipt: body.noReceipt ?? false,
      mergedFilename: body.mergedFilename || null,
      updatedAt: new Date(),
    };

    // If we have a policy number, upsert — otherwise always insert
    if (policyNumber) {
      const result = await collection.findOneAndUpdate(
        { policyNumber },
        {
          $set: fields,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: "after" },
      );
      await mongoClient.close();
      return NextResponse.json({ success: true, id: result?._id });
    } else {
      const result = await collection.insertOne({ ...fields, createdAt: new Date() });
      await mongoClient.close();
      return NextResponse.json({ success: true, id: result.insertedId });
    }
  } catch (err) {
    console.error("pdf-extracted save error:", err);
    if (mongoClient) await mongoClient.close();
    return NextResponse.json(
      { success: false, error: "Failed to save" },
      { status: 500 },
    );
  }
}