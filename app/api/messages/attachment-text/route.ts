/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { ringCentralService } from "@/lib/services/ringcentral";

export const runtime = "nodejs";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

export async function GET(req: NextRequest) {
    const messageId = req.nextUrl.searchParams.get("messageId");

  if (!messageId) {
    return NextResponse.json(
      { error: "messageId is required" },
      { status: 400 },
    );
  }

  try {
    await mongoClient.connect();
    const col = mongoClient.db("db").collection("texas_premium_messages");

    // 1. Cache hit — the whole point. RC is touched once per attachment.
    const doc = await col.findOne(
      { "messages.id": messageId },
      { projection: { "messages.$": 1 } },
    );
        const cached = doc?.messages?.[0]?.replyText;
    const subject = (doc?.messages?.[0]?.subject ?? "").trim();

    // A cached value equal to the subject is a bad row from the earlier
    // version that grabbed RC's body part instead of the MMS part — treat it
    // as a miss so these self-heal without a manual Mongo cleanup.
    if (typeof cached === "string" && cached.trim() && cached.trim() !== subject) {
      return NextResponse.json({ text: cached, cached: true });
    }

        // 2. Miss — one RC call via the shared service, which already carries the
    //    cached token, the 50/min limiter, and 429 retry. Then write the text
    //    back to Mongo so this attachment never costs a second RC call.
        // Ask RC for the message so we can find its text part — the stored copy
    // may not have the attachment list at all.
        const rcMessage: any = await ringCentralService.getMessageById(messageId);

    // RC sends TWO text/plain parts: the body (type "Text", no uri — this is
    // just the "Replied to a message:" placeholder) and the real reply as an
    // MMS part with a uri and size. Take the one that isn't the body.
    const textPart = (rcMessage?.attachments ?? []).find(
      (a: any) =>
        a?.contentType?.startsWith("text/") &&
        a?.type !== "Text" &&
        (a?.uri || a?.size),
    );

    if (!textPart?.id) {
      return NextResponse.json({ text: "", note: "no text part" });
    }

    const contentUri =
      textPart.uri ||
      `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~` +
        `/message-store/${messageId}/content/${textPart.id}`;

    const buffer = await ringCentralService.downloadAttachment(contentUri);
    const text = buffer.toString("utf8").trim();

    // Cache on the message itself, not inside attachments — the array may not
    // exist in our stored copy. Two RC calls on first view, zero after that.
    await col.updateOne(
      { "messages.id": messageId },
      { $set: { "messages.$[m].replyText": text } },
      { arrayFilters: [{ "m.id": messageId }] },
    );

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("attachment-text error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to load attachment text" },
      { status: 500 },
    );
  }
}