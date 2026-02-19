// app/api/get-link-details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  let client: MongoClient | null = null;
  try {
    const linkId = request.nextUrl.searchParams.get("linkId");
    if (!linkId) return NextResponse.json({ success: false });

    client = await MongoClient.connect(uri);
    const db = client.db("db");

    const link = await db
      .collection("payment_link_generated")
      .findOne({ _id: new ObjectId(linkId) });

    if (!link) return NextResponse.json({ success: false });

    // Try up to 5 times (5 seconds total) to find payment data
    let payment = null;
    for (let i = 0; i < 5; i++) {
      payment = await db.collection("completed_payments").findOne(
        { customerPhone: link.customerPhone },
        { sort: { processedAt: -1 } }
      );

      if (payment?.customerEmail && payment?.cardLast4) break;
      if (i < 4) await delay(1000);
    }

    const email = payment?.customerEmail || "";
    const card = payment?.cardLast4 || "";

    // Save back to payment_link_generated for future use
    if (email || card) {
      const updateFields: Record<string, string> = {};
      if (email) updateFields.customerEmail = email;
      if (card) updateFields.cardLast4 = card;
      await db.collection("payment_link_generated").updateOne(
        { _id: new ObjectId(linkId) },
        { $set: updateFields }
      );
    }

    return NextResponse.json({
      success: true,
      email,
      cardLast4: card,
      customerName: payment?.customerName || "",
      amount: link.amount || 0,
    });
  } catch {
    return NextResponse.json({ success: false });
  } finally {
    if (client) await client.close();
  }
}