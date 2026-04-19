import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export async function GET(request: Request) {
  // Auth check
  const adminKey = request.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const documentId = searchParams.get("documentId");

  if (!email && !documentId) {
    return NextResponse.json({ error: "Provide email or documentId" }, { status: 400 });
  }

  try {
    const mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");

    const query = documentId ? { documentId } : { email, ...(email ? {} : {}) };
    const record = await db.collection("consent_audit_log").findOne(
      query,
      { sort: { createdAt: -1 } }
    );
    await mongoClient.close();

    if (!record || !record.pdfBase64) {
      return NextResponse.json({ error: "Consent PDF not found" }, { status: 404 });
    }

    const pdfBuffer = Buffer.from(record.pdfBase64, "base64");
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Consent_${record.customerName?.replace(/\s+/g, "_") ?? "document"}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}