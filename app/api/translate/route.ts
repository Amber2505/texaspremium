import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text, to } = await req.json();
    if (!text?.trim()) return NextResponse.json({ translated: text });

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Translate this insurance payment description to ${to === "es" ? "Spanish" : "English"}. Return ONLY the translated text, nothing else.\n\n${text}`,
      }],
    });

    const translated = response.choices[0]?.message?.content?.trim() ?? text;
    return NextResponse.json({ translated });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}