// app/api/docs/[token]/finish/route.ts
// Public: customer leaves the upload step of the payment-link flow.
// Marks the step done on the payment link (so the flow moves on to the
// thank-you page) and, if they chose "upload later" with items still
// missing, texts them the link once.
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { allUploaded, notifyRailway, requestsCollection } from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { later } = await req.json().catch(() => ({}));

    const col = await requestsCollection();
    const doc = await col.findOne({ token });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (doc.paymentLinkId) {
      const client = await connectToDatabase;
      await client
        .db("db")
        .collection("payment_link_generated")
        .updateOne(
          { _id: doc.paymentLinkId },
          { $set: { "completedStages.documents": true, "timestamps.documents": new Date().toISOString() } },
        );
    }

    const open = new Date(doc.expiresAt).getTime() > Date.now();
    if (later && open && !allUploaded(doc)) {
      // Claim first so a double-tap can't text twice
      const claimed = await col.updateOne(
        { _id: doc._id, laterTextAt: null },
        { $set: { laterTextAt: new Date() } },
      );
      if (claimed.modifiedCount) {
        await notifyRailway("/notify/documents-later", { requestId: doc._id!.toString() });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Docs finish error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}