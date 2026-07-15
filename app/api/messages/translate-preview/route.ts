// api/messages/translate-preview/route.ts
/*eslint-disable @typescript-eslint/no-explicit-any*/

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, direction } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });

    // Only mention placeholder tokens if the text actually contains one.
    // Otherwise the model invents [[LINK_0]] on short messages.
    const hasPlaceholder = /\[\[LINK_\d+\]\]/.test(text);

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
        temperature: 0.2,
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
${hasPlaceholder ? `8. Preserve placeholder tokens of the form [[LINK_0]], [[LINK_1]], etc. EXACTLY as written — same spelling, same brackets, same position in the text. These are stand-ins for URLs. Do not translate them, do not remove them, do not move them to a different line, and do not add surrounding text. A placeholder on its own line MUST stay on its own line. A placeholder at the very start of the message MUST remain at the very start.\n` : ""}${hasPlaceholder ? "9" : "8"}. Preserve the original line breaks and blank lines exactly — if the input has the same number of lines in and out
${hasPlaceholder ? "10" : "9"}. Return ONLY the translated text — no explanations, no quotation marks, no preamble`,
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