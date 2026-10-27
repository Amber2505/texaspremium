// app/api/messages/claim-autoreply/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Triggered every 3 min by the Railway server. After-hours auto-reply for
// customers trying to open a claim. Sends a generic link to Samantha's
// verified claim flow, never a carrier-specific link, so the chatbot
// picks the right company after phone verification.
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { getBusinessHoursInfo } from "@/lib/business-hours-server";

export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_REPLY_MODEL || "gpt-4o-mini";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.texaspremiumins.com";
// const CRIS_URL = "https://cris.dot.state.tx.us/public/Purchase/";
const DRY_RUN = process.env.CLAIM_AUTOREPLY_DRY_RUN === "true";
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // ignore anything older than 2h
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // max one auto-reply per number per day
const MAX_PER_RUN = 20;

// English gets a trailing \b so "fired", "Firestone", "hit me up" don't match.
// Spanish keeps leading-only \b: JS \b doesn't understand accented letters,
// so a trailing one would miss "choqué". The AI still makes the final call.
const CLAIM_HINT_EN =
  /\b(claims?|accident|crash(ed)?|wreck(ed)?|collision|rear[- ]?ended|hit my|hit me(?!\s+up)|someone hit|total(l)?ed|stolen|theft|broke into|break[- ]in|vandali[sz]ed|hail|flood(ed)?|fire|towed|tow truck)\b/i;
const CLAIM_HINT_ES =
  /\b(reclamo|accidente|choque|choc[oóa]|choqu|me peg|rob[oóa]|granizo|incendio|inundaci|gr[uú]a)/i;
const hasClaimHint = (t: string) =>
  CLAIM_HINT_EN.test(t) || CLAIM_HINT_ES.test(t);

// Must match the admin page and reply-status route (keeps the thread pinned).
// NOT exported: route files may only export HTTP handlers and route config.
const AUTO_REPLY_MARKER =
  /automated after-hours message|mensaje automático fuera de horario/i;

type Lang = "en" | "es";
type ClaimType = "auto_accident" | "other";

// One text per reply (RingCentral caps a single SMS at ~1,000 characters).
// The note at the end matches AUTO_REPLY_MARKER, which keeps the thread
// pinned on the admin page.
function buildMessages(lang: Lang, claimType: ClaimType): string[] {
  const claimLink = `${SITE_URL}/${lang}?chat=claim`;
  const docsLink = `${SITE_URL}/${lang}/view_documents`;

  if (lang === "es") {
    if (claimType === "auto_accident") {
      return [
        `¡Lamentamos lo del accidente! Pasos rápidos:\n\n1. Manténgase a salvo. Llame al 911 si alguien está herido.\n2. Intercambie información con el otro conductor: nombre, teléfono, aseguradora, número de póliza y placas. Espere a la policía.\n3. Pida el número de caso. Puede buscar el reporte después en cris.dot.state.tx.us\n4. ¿Necesita grúa? Llame al número en su tarjeta de seguro, o use cualquier grúa y guarde el recibo. El reembolso depende de su cobertura. Su tarjeta y documentos:\n${docsLink}\n5. Abra su reclamo aquí (solo verifique su teléfono):\n${claimLink}\n\nUn ajustador lo contactará en 24 a 96 horas.\n\nNota: Mensaje automático fuera de horario. Un agente le dará seguimiento cuando abramos.`,
      ];
    }
    return [
      `Lamentamos lo sucedido. Nuestra oficina está cerrada en este momento.\n\nSi alguien está herido o en peligro, llame al 911 primero.\n\nAbra su reclamo aquí (solo verifique su teléfono):\n${claimLink}\n\nUn ajustador lo contactará en 24 a 96 horas.\n\nNota: Mensaje automático fuera de horario. Un agente le dará seguimiento cuando abramos.`,
    ];
  }

  if (claimType === "auto_accident") {
    return [
      `Sorry about the accident! Quick steps:\n\n1. Stay safe. Call 911 if anyone is hurt.\n2. Exchange info with the other driver: name, phone, insurance company, policy # and license plate. Wait for the police.\n3. Get the police case number. You can look up the report later at cris.dot.state.tx.us\n4. Need a tow? Call the number on your ID card, or use any tow service and keep the receipt. Whether towing is reimbursed depends on your coverage. Your ID card and documents:\n${docsLink}\n5. Open your claim here (just verify your phone number):\n${claimLink}\n\nA claims adjuster will reach out within 24-96 hours.\n\nNote: Automated after-hours message. An agent will follow up when we reopen.`,
    ];
  }
  return [
    `Sorry you're dealing with this. Our office is closed right now.\n\nIf anyone is hurt or in danger, please call 911 first.\n\nOpen your claim here (just verify your phone number):\n${claimLink}\n\nA claims adjuster will reach out within 24-96 hours.\n\nNote: Automated after-hours message. An agent will follow up when we reopen.`,
  ];
}

const SYSTEM = `You review after-hours SMS sent to an insurance agency. Each thread has an optional EARLIER section (context only) and a NEW section: the customer's messages since the agency last replied.

Decide ONLY from the NEW messages whether the customer is reporting a loss that just happened or is trying to open a claim right now. EARLIER messages may help you understand a short NEW message ("it just happened", "yes please"), but an accident mentioned only in EARLIER messages is NOT a reason to answer true.

openClaim=true with confidence "high" only when the NEW messages:
- say they just had an accident, crash, or collision, or were hit ("I just got rear ended", "someone hit my car", "choqué", "me chocaron")
- report their car or property was stolen, broken into, vandalized, or damaged by hail, flood, fire, or a fallen tree
- ask how to file, open, or report a claim
This is still true if they also ask for a call back or address an agent by name.

openClaim=false for everything else, including:
- payments, payment links, due dates, autopay, cancellations, reinstatement
- quotes, renewals, adding or removing a car or driver, ID cards, proof of insurance, documents
- coverage questions with no loss described ("am I covered for hail?", "do I have rental?")
- past accidents mentioned for context ("I had an accident 2 years ago", "my rate went up after my accident", "accident forgiveness")
- status of an existing claim, adjuster, repair shop, or rental on a claim already filed
- greetings, "call me", thanks, or anything vague with no loss described
- "hit" used as slang ("hit me up")

Use "high" only when the NEW messages plainly describe a new loss or a request to file. If you have to guess, use "medium" or "low".
claimType: "auto_accident" if they report a vehicle accident or collision; otherwise "other" (theft, vandalism, hail, home damage, commercial, or unclear).
lang: the language of the customer's latest message.
reason: a few words explaining the decision.
Respond ONLY with JSON: {"results":[{"id":"t0","openClaim":true,"confidence":"high","claimType":"auto_accident","lang":"en","reason":"reports new accident, asks for a call"}]}`;

async function sendSms(origin: string, to: string, message: string) {
  const fd = new FormData();
  fd.append("to", to);
  fd.append("message", message);
  const res = await fetch(`${origin}/api/send`, { method: "POST", body: fd });
  if (!res.ok) console.error("claim-autoreply send failed:", res.status);
  return res.ok;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { schedule } = await getBusinessHoursInfo();

  // Office is open: agents handle it
  if (isWithinBusinessHours(schedule, now)) {
    return NextResponse.json({ skipped: "business hours" });
  }

  try {
    const client = await clientPromise;
    const coll = client.db("db").collection("texas_premium_messages");

    const since = new Date(now.getTime() - LOOKBACK_MS);
    const docs = await coll
      .find(
        {
          // lastMessageTime is stored as an ISO string by the sync; the Date
          // branch covers any older documents
          $or: [
            { lastMessageTime: { $gte: since.toISOString() } },
            { lastMessageTime: { $gte: since } },
          ],
        },
        {
          projection: {
            conversationId: 1,
            phoneNumber: 1,
            participants: 1,
            isGroup: 1,
            language: 1,
            claimAutoReply: 1,
            messages: { $slice: -10 },
          },
        },
      )
      .limit(200)
      .toArray();

    const candidates: any[] = [];

    // ?debug=1 reports why each recent thread was or wasn't picked up
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    const skipped: Array<{ id: string; reason: string; last?: string }> = [];
    const skip = (doc: any, reason: string, last?: any) => {
      if (debug) {
        skipped.push({
          id: doc.conversationId || doc.phoneNumber,
          reason,
          last: last
            ? `${last.direction} ${last.creationTime} "${String(last.subject || "").slice(0, 40)}"`
            : undefined,
        });
      }
    };

    for (const doc of docs as any[]) {
      // Call-log rows aren't something the customer *said*. With every
      // extension's calls synced, a missed call landing after last week's
      // "I had an accident" text would otherwise re-trigger the claim reply.
      const msgs: any[] = (doc.messages || []).filter(
        (m: any) => m.type !== "MissedCall" && m.type !== "AnsweredCall",
      );
      const last = msgs[msgs.length - 1];
      if (!last?.id || last.direction !== "Inbound") {
        skip(doc, "last message is not inbound", last);
        continue;
      }
      // Only what the customer sent since we last replied is up for judging
      const lastOutIdx = msgs
        .map((m: any) => m.direction)
        .lastIndexOf("Outbound");
      const newMsgs = msgs.slice(lastOutIdx + 1);
      if (doc.isGroup || (doc.participants?.length ?? 1) > 1) {
        skip(doc, "group chat", last);
        continue;
      }
      if (doc.claimAutoReply?.lastMessageId === last.id) {
        skip(doc, "already decided", last);
        continue;
      }

      const sentAt = doc.claimAutoReply?.sentAt
        ? new Date(doc.claimAutoReply.sentAt).getTime()
        : 0;
      if (now.getTime() - sentAt < COOLDOWN_MS) {
        skip(doc, "24h cooldown", last);
        continue;
      }

      const created = new Date(last.creationTime);
      if (isNaN(created.getTime()) || created < since) {
        skip(doc, "older than 2h or bad date", last);
        continue;
      }
      if (isWithinBusinessHours(schedule, created)) {
        skip(doc, "arrived during business hours", last);
        continue;
      }

      // Never auto-reply twice in the same visible thread
      if (
        msgs.some(
          (m) =>
            m.direction === "Outbound" &&
            AUTO_REPLY_MARKER.test(m.subject || ""),
        )
      ) {
        skip(doc, "auto-reply already in thread", last);
        continue;
      }

      // Free keyword filter over the customer's recent messages
      const customerText = newMsgs
        .map((m: any) => m.replyText || m.subject || "")
        .join(" ");
      if (!hasClaimHint(customerText)) {
        skip(doc, "no claim keyword in new messages", last);
        continue;
      }

      candidates.push({ doc, last, msgs, newMsgs });
      if (candidates.length >= MAX_PER_RUN) break;
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("claim-autoreply: OPENAI_API_KEY is not set");
      return NextResponse.json({
        checked: 0,
        error: "OPENAI_API_KEY missing",
        ...(debug ? { windowDocs: docs.length, skipped } : {}),
      });
    }
    if (candidates.length === 0) {
      return NextResponse.json({
        checked: 0,
        ...(debug ? { windowDocs: docs.length, skipped } : {}),
      });
    }

    // One OpenAI call for the whole batch
    const fmt = (m: any) => {
      const who = m.direction === "Outbound" ? "Agent" : "Customer";
      const text = (m.replyText || m.subject || "")
        .split(/\n\nNot[ae]:/)[0]
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      return `${who}: ${text || "(no text)"}`;
    };
    const threads = candidates
      .map(({ msgs, newMsgs }, i) => {
        const earlier = msgs.slice(0, msgs.length - newMsgs.length);
        return [
          `### t${i}`,
          earlier.length
            ? `EARLIER (context only):\n${earlier.map(fmt).join("\n")}`
            : "",
          `NEW (classify these):\n${newMsgs.map(fmt).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 70 * candidates.length + 50,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: threads },
        ],
      }),
    });

    if (!aiRes.ok) {
      console.error("claim-autoreply OpenAI error:", aiRes.status);
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    const results: any[] = Array.isArray(parsed.results) ? parsed.results : [];
    const origin = new URL(req.url).origin;
    const writes: any[] = [];
    let sentCount = 0;

    for (const r of results) {
      const idx = parseInt(String(r.id).replace(/\D/g, ""), 10);
      const c = candidates[idx];
      if (!c) continue;

      const shouldSend = r.openClaim === true && r.confidence === "high";
      const lang: Lang =
        r.lang === "es" || (r.lang !== "en" && c.doc.language === "es")
          ? "es"
          : "en";
      const claimType: ClaimType =
        r.claimType === "auto_accident" ? "auto_accident" : "other";

      let didSend = false;
      if (shouldSend && DRY_RUN) {
        console.log(
          `[DRY RUN] would send ${claimType} claim auto-reply (${lang}) to ${c.doc.phoneNumber}`,
        );
      } else if (shouldSend) {
        try {
          const parts = buildMessages(lang, claimType);
          didSend = true;
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) await new Promise((res) => setTimeout(res, 1500)); // keep order
            if (!(await sendSms(origin, c.doc.phoneNumber, parts[i]))) {
              didSend = false;
              break; // don't send part 2 without part 1
            }
          }
        } catch (err) {
          didSend = false;
          console.error("claim-autoreply send error:", err);
        }
      }

      if (didSend) sentCount++;

      writes.push({
        updateOne: {
          filter: { _id: c.doc._id },
          update: {
            $set: {
              claimAutoReply: {
                lastMessageId: c.last.id,
                checkedAt: now,
                openClaim: r.openClaim === true,
                confidence: r.confidence || "low",
                claimType,
                reason: String(r.reason || "").slice(0, 80),
                sent: didSend,
                // Only a real send starts the 24h cooldown
                sentAt: didSend ? now : c.doc.claimAutoReply?.sentAt || null,
              },
            },
          },
        },
      });
    }

    if (writes.length > 0) await coll.bulkWrite(writes);

    return NextResponse.json({
      checked: candidates.length,
      sent: sentCount,
      dryRun: DRY_RUN,
      ...(debug ? { windowDocs: docs.length, skipped, results } : {}),
    });
  } catch (error) {
    console.error("claim-autoreply error:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}