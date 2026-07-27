//app/lib/extractPdfSteps.ts
// Extracts one step (title + description) per PDF page. Reads the PDF's text
// layer directly with pdf.js — no pdf-parse, no sending PDFs to GPT (both of
// which caused errors before). OpenAI is used only to tidy raw page text into
// a clean {title, description}. Falls back to raw text if OpenAI is unavailable.

import OpenAI from "openai";

// pdfjs-dist v3's legacy build is CommonJS. A plain require() sidesteps
// webpack's ESM/CJS interop, which can resolve to undefined for the default
// export depending on how the module gets bundled (see lib/pdfToImages.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLegacy = require("pdfjs-dist/legacy/build/pdf.js");
const { getDocument } = pdfjsLegacy;

// Do NOT set GlobalWorkerOptions.workerSrc — see the comment in
// lib/pdfToImages.ts. outputFileTracingIncludes handles making the worker
// file available; workerSrc is irrelevant to Node's fake-worker path and
// setting it breaks pdf.js in this environment.

export interface GuideStep {
  title: string;
  description: string;
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Pull the raw text of each page (page 1 / cover skipped by default so it
 * lines up with renderPdfToImages, which also skips page 1).
 */
async function extractPerPageText(
  pdfBuffer: Buffer,
  skipFirstPage = true,
): Promise<string[]> {
  const data = new Uint8Array(pdfBuffer);
  const doc = await getDocument({ data }).promise;

  const pages: string[] = [];
  const startPage = skipFirstPage ? 2 : 1;

  for (let n = startPage; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      // @ts-expect-error — str exists on text items
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return pages;
}

/**
 * Turn raw page texts into clean per-page steps. One step per page, order
 * preserved, so steps[i] matches page image [i].
 */
export async function extractPdfSteps(
  pdfBuffer: Buffer,
  skipFirstPage = true,
): Promise<GuideStep[]> {
  const pageTexts = await extractPerPageText(pdfBuffer, skipFirstPage);

  // Local fallback: first sentence = title, rest = description.
  const fallback = (): GuideStep[] =>
    pageTexts.map((t, i) => {
      if (!t) return { title: `Step ${i + 1}`, description: "" };
      const parts = t.split(/(?<=[.!?])\s+/);
      const title = (parts[0] || `Step ${i + 1}`).slice(0, 80);
      const description = parts.slice(1).join(" ").trim();
      return { title, description };
    });

  if (!process.env.OPENAI_API_KEY) return fallback();

  try {
    const numbered = pageTexts
      .map((t, i) => `Page ${i + 1}: ${t || "(no text)"}`)
      .join("\n");

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content:
            `Below is the text of each page of a step-by-step how-to guide, one page per line. ` +
            `For EACH page, produce one step as an object with "title" (a short imperative heading, e.g. "Navigate to Payment Links") ` +
            `and "description" (one clear sentence explaining the action). ` +
            `Return ONLY a valid JSON array with exactly ${pageTexts.length} objects, in page order, no markdown, no extra text.\n\n` +
            `Example: [{"title":"Navigate to Payment Links","description":"Click 'Payment Links' in the left-hand menu to open the creation page."}]\n\n` +
            `Pages:\n${numbered}`,
        },
      ],
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as GuideStep[];

    if (!Array.isArray(parsed) || parsed.length === 0) return fallback();

    // Force alignment to page count — pad or trim so steps match images 1:1.
    const result: GuideStep[] = [];
    for (let i = 0; i < pageTexts.length; i++) {
      result.push(
        parsed[i] && parsed[i].title
          ? {
            title: String(parsed[i].title).slice(0, 120),
            description: String(parsed[i].description ?? ""),
          }
          : { title: `Step ${i + 1}`, description: pageTexts[i] ?? "" },
      );
    }
    return result;
  } catch (err) {
    console.error("extractPdfSteps: OpenAI structuring failed, using fallback:", err);
    return fallback();
  }
}