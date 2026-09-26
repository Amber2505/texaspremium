// app/api/messages/reply-status/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const MODEL = process.env.OPENAI_REPLY_MODEL || "gpt-4o-mini";
const MAX_BATCH = 25;
const CONTEXT_MESSAGES = 6;

type Item = { conversationId: string; lastMessageId: string };
type Verdict = { needsReply: boolean; reason: string };

const SYSTEM = `You triage SMS threads for an insurance agency. For each thread, decide whether the agency still owes the customer a reply.
needsReply=true when the customer's latest message(s) ask a question, request something (quote, payment help, documents, a call back), report a problem, send a photo/document that needs acknowledging, or left a voicemail/missed call.
needsReply=false when the customer is only closing the conversation (thanks, ok, bye, confirming), reacting, or acknowledging something the agent already handled.
Messages may be in Spanish. If unsure, answer true.
Respond ONLY with JSON: {"results":[{"id":"t0","needsReply":true,"reason":"short English reason, max 8 words"}]}`;

// Strip the scheduled-reminder footer — it's boilerplate and costs tokens
const stripFooter = (s: string) => s.split(/\n\nNot[ae]:/)[0];

export async function POST(req: Request) {
  try {
    const { items } = (await req.json()) as { items?: Item[] };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ verdicts: {} });
    }
    const batch = items.slice(0, MAX_BATCH);

    const client = await clientPromise;
    const coll = client.db("db").collection("texas_premium_messages");

    const ids = batch.map((i) => i.conversationId);
    const docs = await coll
      .find(
        {
          $or: [
            { conversationId: { $in: ids } },
            { phoneNumber: { $in: ids } },
          ],
        },
        {
          projection: {
            conversationId: 1,
            phoneNumber: 1,
            replyStatus: 1,
            messages: { $slice: -CONTEXT_MESSAGES },
          },
        },
      )
      .toArray();

    const byKey = new Map(
      docs.map((d: any) => [d.conversationId || d.phoneNumber, d]),
    );

    const verdicts: Record<string, Verdict> = {};
    const misses: Array<{ item: Item; doc: any; actualLastId: string }> = [];
    const freeWrites: any[] = [];

    for (const item of batch) {
      const doc: any = byKey.get(item.conversationId);
      if (!doc) continue;
      const key = `${item.conversationId}:${item.lastMessageId}`;
      const msgs: any[] = doc.messages || [];
      const last = msgs[msgs.length - 1];
      const actualLastId = last?.id || item.lastMessageId;

      // Cache hit — no AI call
      if (doc.replyStatus?.lastMessageId === actualLastId) {
        verdicts[key] = {
          needsReply: doc.replyStatus.needsReply,
          reason: doc.replyStatus.reason || "",
        };
        continue;
      }

      // Our after-hours claim auto-reply — a human still needs to follow up
      if (
        last?.direction === "Outbound" &&
        /automated after-hours message|mensaje automático fuera de horario/i.test(
          last.subject || "",
        )
      ) {
        verdicts[key] = { needsReply: true, reason: "claim · auto-replied" };
        freeWrites.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                replyStatus: {
                  lastMessageId: actualLastId,
                  needsReply: true,
                  reason: "claim · auto-replied",
                  checkedAt: new Date(),
                },
              },
            },
          },
        });
        continue;
      }

      // An agent replied since the client's snapshot — settled for free
      if (last?.direction === "Outbound") {
        verdicts[key] = { needsReply: false, reason: "agent replied" };
        freeWrites.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                replyStatus: {
                  lastMessageId: actualLastId,
                  needsReply: false,
                  reason: "agent replied",
                  checkedAt: new Date(),
                },
              },
            },
          },
        });
        continue;
      }

      misses.push({ item, doc, actualLastId });
    }

    if (misses.length > 0 && process.env.OPENAI_API_KEY) {
      const threads = misses
        .map(({ doc }, i) => {
          const lines = (doc.messages || []).map((m: any) => {
            const who = m.direction === "Outbound" ? "Agent" : "Customer";
            let text = stripFooter(m.replyText || m.subject || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300);
            if (m.type === "Voicemail") text = `[voicemail] ${text}`;
            else if (m.type === "MissedCall") text = "[missed call]";
            else if (m.type === "AnsweredCall") text = "[phone call]";
            if (m.attachments?.length && m.type !== "Voicemail") {
              text += ` [${m.attachments.length} attachment(s)]`;
            }
            return `${who}: ${text || "(no text)"}`;
          });
          return `### t${i}\n${lines.join("\n")}`;
        })
        .join("\n\n");

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0,
            max_tokens: 40 * misses.length + 50,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: threads },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          const results: any[] = Array.isArray(parsed.results)
            ? parsed.results
            : [];
          const aiWrites: any[] = [];

          for (const r of results) {
            const idx = parseInt(String(r.id).replace(/\D/g, ""), 10);
            const miss = misses[idx];
            if (!miss || typeof r.needsReply !== "boolean") continue;
            const v: Verdict = {
              needsReply: r.needsReply,
              reason: String(r.reason || "").slice(0, 80),
            };
            verdicts[
              `${miss.item.conversationId}:${miss.item.lastMessageId}`
            ] = v;
            aiWrites.push({
              updateOne: {
                filter: { _id: miss.doc._id },
                update: {
                  $set: {
                    replyStatus: {
                      lastMessageId: miss.actualLastId,
                      ...v,
                      checkedAt: new Date(),
                      model: MODEL,
                    },
                  },
                },
              },
            });
          }
          freeWrites.push(...aiWrites);
        } else {
          console.error("reply-status OpenAI error:", res.status);
        }
      } catch (err) {
        // Fail open: misses get no verdict, so the UI keeps them pinned
        console.error("reply-status OpenAI failed:", err);
      }
    }

    if (freeWrites.length > 0) {
      await coll.bulkWrite(freeWrites);
    }

    return NextResponse.json({ verdicts });
  } catch (error) {
    console.error("reply-status error:", error);
    return NextResponse.json({ verdicts: {} }, { status: 500 });
  }
}