// api/messages/translate-preview/route.ts
/*eslint-disable @typescript-eslint/no-explicit-any*/

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, direction } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });

    const targetLang = direction === "to-es" ? "Spanish" : "English";
const sourceLang = direction === "to-es" ? "English" : "Spanish";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a professional translator specializing in insurance communications for a Texas-based auto insurance agency. Translate from ${sourceLang} to ${targetLang}.

CRITICAL RULES — follow these exactly:
1. NEVER translate or alter proper names (people's names like "Jose Lopez", "Venissa", etc.) — keep them exactly as written
2. NEVER translate "Texas Premium Insurance Services" — keep it exactly as is
3. NEVER remove, skip, or summarize any part of the message — translate everything fully
4. Keep all dates, amounts, policy numbers, phone numbers, and reference numbers exactly as written
5. Keep payment terms like "Monthly payment", "Down payment" translated naturally but keep any names or identifiers next to them intact
6. Use natural, conversational Latin American Spanish — not formal Castilian Spanish
7. Sound like a friendly local insurance agent, not a robot or formal document
8. Return ONLY the translated text — no explanations, no quotation marks, no preamble`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    const data = await res.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error("No translation returned");
    return NextResponse.json({ translated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}