// app/api/consent-pdf/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: Request) {
  // ✅ Auth check — verifies signed httpOnly cookie (admin_auth)
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const documentId = searchParams.get("documentId");
  // Accept a reference timestamp to pick closest consent record (for old records)
  const nearTimestamp = searchParams.get("nearTimestamp");
  // Accept phone as an extra filter for ambiguous email matches
//   const phone = searchParams.get("phone");

  if (!email && !documentId) {
    return NextResponse.json(
      { error: "Provide email or documentId" },
      { status: 400 }
    );
  }

  let mongoClient: MongoClient | null = null;

  try {
    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection("consent_audit_log");

    let record = null;

    // ── PATH 1: Exact lookup by documentId ──
    if (documentId) {
      record = await collection.findOne({ documentId });

      if (!record) {
        await mongoClient.close();
        return NextResponse.json(
          { error: "Consent PDF not found for this document ID" },
          { status: 404 }
        );
      }
    }
    // ── PATH 2: Email fallback (for old records without consentDocumentId) ──
    else if (email) {
      // Get all records for this email
      const allForEmail = await collection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();

      if (allForEmail.length === 0) {
        await mongoClient.close();
        return NextResponse.json(
          { error: "No consent records found for this email" },
          { status: 404 }
        );
      }

      // If only one record exists, no ambiguity
      if (allForEmail.length === 1) {
        record = allForEmail[0];
      }
      // If nearTimestamp provided, pick the record closest to that time
      else if (nearTimestamp) {
        const target = new Date(nearTimestamp).getTime();
        if (isNaN(target)) {
          record = allForEmail[0]; // fallback to most recent
        } else {
          // Find the record with the smallest time delta
          record = allForEmail.reduce((best: any, current: any) => {
            const bestDelta = Math.abs(
              new Date(best.createdAt).getTime() - target
            );
            const currentDelta = Math.abs(
              new Date(current.createdAt).getTime() - target
            );
            return currentDelta < bestDelta ? current : best;
          });
        }
      }
      // Multiple records, no timestamp hint → return ambiguity error with options
      else {
        await mongoClient.close();
        return NextResponse.json(
          {
            error: "Multiple consent records found. Please specify which one.",
            ambiguous: true,
            records: allForEmail.map((r: any) => ({
              documentId: r.documentId,
              customerName: r.customerName,
              amount: r.amount,
              cardLast4: r.cardLast4,
              createdAt: r.createdAt,
            })),
          },
          { status: 409 } // Conflict — needs disambiguation
        );
      }
    }

    await mongoClient.close();

    if (!record || !record.pdfBase64) {
      return NextResponse.json(
        { error: "Consent PDF data not found" },
        { status: 404 }
      );
    }

    const pdfBuffer = Buffer.from(record.pdfBase64, "base64");
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Consent_${
          record.customerName?.replace(/\s+/g, "_") ?? "document"
        }_${record.documentId?.slice(0, 8) ?? "doc"}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    if (mongoClient) await mongoClient.close();
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}