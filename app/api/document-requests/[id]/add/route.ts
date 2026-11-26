// app/api/document-requests/[id]/add/route.ts
// Agent asks for more documents on a link that's already been sent.
// Adds the items to the same request and texts the customer the same link.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  buildItems,
  linkFor,
  requestsCollection,
  type RequestSpec,
} from "@/lib/documentRequests";

export const runtime = "nodejs";

const MAX_ITEMS = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id))
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const specs = Array.isArray(body.specs) ? (body.specs as RequestSpec[]) : [];
    const by = body.by ? String(body.by).slice(0, 60) : null;

    let newItems;
    try {
      newItems = buildItems(specs);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const col = await requestsCollection();
    const _id = new ObjectId(id);
    const doc = await col.findOne({ _id });
    if (!doc)
      return NextResponse.json({ error: "Request not found." }, { status: 404 });

    // Same link, same 10 days
    if (new Date(doc.expiresAt).getTime() <= Date.now())
      return NextResponse.json(
        { error: "This link has expired. Reopen it first, or create a new request." },
        { status: 400 },
      );
    if (doc.items.length + newItems.length > MAX_ITEMS)
      return NextResponse.json(
        { error: `A link can hold up to ${MAX_ITEMS} documents.` },
        { status: 400 },
      );

    const now = new Date();
    await col.updateOne(
      { _id },
      {
        $push: { items: { $each: newItems } },
        // Back to Pending until the new items are uploaded. Clearing
        // allReceivedSmsAt lets the "we got everything" text go out again.
        $set: {
          allReceivedAt: null,
          allReceivedSmsAt: null,
          completedAt: null,
          completedBy: null,
          lastAddedAt: now,
          lastAddedBy: by,
        } as any,
      },
    );

    // Text the customer the same link
    const link = linkFor(doc);
    const first = doc.customerName.split(" ")[0] || "";
    const es = doc.language === "es";
    const labels = newItems.map((i) => (es ? i.labelEs : i.labelEn)).join(", ");
    const message = es
      ? `Hola ${first}, su agente de Texas Premium Insurance necesita más documentos: ${labels}. Puede subirlos con el mismo enlace: ${link}`
      : `Hi ${first}, your agent at Texas Premium Insurance needs a few more documents: ${labels}. You can upload them with the same link: ${link}`;

    let smsSent = false;
    try {
      const r = await fetch(`${req.nextUrl.origin}/api/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: doc.customerPhone, message }),
        signal: AbortSignal.timeout(15000),
      });
      smsSent = r.ok;
      if (!r.ok) console.error("Add-docs SMS failed:", await r.text());
    } catch (e) {
      console.error("Add-docs SMS error:", e);
    }

    return NextResponse.json({
      success: true,
      link,
      smsSent,
      added: newItems.length,
      labels: newItems.map((i) => i.labelEn),
      expiresAt: doc.expiresAt,
    });
  } catch (e) {
    console.error("Add documents error:", e);
    return NextResponse.json({ error: "Couldn't add the documents." }, { status: 500 });
  }
}