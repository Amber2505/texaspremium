// app/api/ai-extract/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

interface AiExtractRequest {
  // Base64-encoded PNG — can be full page 1 or a cropped logo region
  pageImageBase64: string;
  // Which fields to extract (frontend only asks for missing ones)
  missingFields: string[];
  // If true, image is a cropped logo — only identify the company
  logoOnly?: boolean;
}

export async function POST(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  try {
    const body = (await request.json()) as AiExtractRequest;
    const { pageImageBase64, missingFields, logoOnly } = body;

    if (!pageImageBase64) {
      return NextResponse.json(
        { success: false, error: "Missing image" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const fieldDescriptions: Record<string, string> = {
      insuredName:
        "the named insured / applicant's full name (typically the policyholder)",
      policyNumber:
        "the policy number (alphanumeric identifier, often with dashes)",
      companyName:
        "the insurance carrier / company name. IMPORTANT: this may appear ONLY as a LOGO image at the top of the page with no text — look carefully at logos and brand marks. Common carriers: Safeway, State Farm, GEICO, Allstate, Progressive, Farmers, Wellington, Venture, InsureMax, Connect MGA, Safeco, etc. If you recognize a logo, output the full company name.",
      effectiveDate:
        "the policy effective date (start date) in MM/DD/YYYY format",
      expirationDate:
        "the policy expiration date (end date) in MM/DD/YYYY format",
    };

    let systemPrompt: string;
    let userPrompt: string;

    if (logoOnly) {
      // Single-purpose: identify a logo
      systemPrompt = `You are an insurance-industry logo recognition expert. You will be shown a cropped image of a company logo from an insurance document. Your job is to identify the insurance carrier and return its full official company name.

Common carriers include: Safeway Insurance Company, State Farm, GEICO, Allstate, Progressive, Farmers Insurance, Wellington Insurance, Venture General Agency, InsureMax Insurance Company, Connect MGA LLC, Safeco, Travelers, Liberty Mutual, Nationwide, USAA, Mercury Insurance, Kemper, Bristol West, Infinity, National General, The General, etc.

Return a JSON object: {"companyName": "Full Company Name"}. If you cannot identify the logo, return {"companyName": null}. No markdown, no code fences, just the JSON.`;
      userPrompt = `Identify the insurance carrier from this logo. Return ONLY {"companyName": "..."} JSON.`;
    } else {
      if (!missingFields || missingFields.length === 0) {
        return NextResponse.json(
          { success: false, error: "Missing field list" },
          { status: 400 },
        );
      }
      const requestedFields = missingFields
        .filter((f) => fieldDescriptions[f])
        .map((f) => `- ${f}: ${fieldDescriptions[f]}`)
        .join("\n");

      systemPrompt = `You are a precision data extractor for insurance policy documents. You will be shown page 1 of an insurance policy package. Your job is to extract specific fields with 100% character accuracy — this data will be used for legal and billing purposes, so mistakes cost real money.

CRITICAL ACCURACY RULES:
1. Read every character EXACTLY as printed. Do not interpret, guess, or normalize.
2. For DATES: read each digit individually. Confusable digits include 6↔8, 2↔7, 0↔O, 1↔l↔I, 3↔8, 5↔6. When in doubt, prefer the digit that makes the date internally consistent (effective and expiration dates are usually 6 or 12 months apart — if you see "04/17/2022" and "10/17/2026", one is wrong).
3. For POLICY NUMBERS: these are alphanumeric with dashes/slashes. Read each character; do not omit dashes.
4. For NAMES: preserve capitalization exactly.
5. For COMPANY NAMES: may appear ONLY as a logo image. Identify from the logo if needed. Common carriers: Safeway, State Farm, GEICO, Allstate, Progressive, Farmers, Wellington, Venture, InsureMax, Connect MGA, Safeco, Kemper, Bristol West, Infinity, National General, The General.
6. If you truly cannot find a field, return null — DO NOT GUESS.
7. If you see a date that doesn't make sense given the other date (e.g., expiration before effective, or years >10 apart), re-read both dates carefully.

Return ONLY a JSON object with the requested field names. No markdown, no code fences, no commentary.`;
      userPrompt = `Extract these fields from the document image:\n${requestedFields}\n\nReturn ONLY a JSON object like {"fieldName": "value"}. Read every character exactly — especially digits in dates and policy numbers. If dates are both present, verify they make sense together (effective should be before expiration, typically 6 or 12 months apart).`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: logoOnly ? 100 : 400,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${pageImageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return NextResponse.json(
        {
          success: false,
          error: `OpenAI API returned ${response.status}`,
        },
        { status: 500 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Empty response from OpenAI" },
        { status: 500 },
      );
    }

    let extracted: Record<string, string | null>;
    try {
      const cleaned = content
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/```$/, "")
        .trim();
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse OpenAI response:", content, parseErr);
      return NextResponse.json(
        { success: false, error: "Invalid JSON from OpenAI" },
        { status: 500 },
      );
    }

    // Clean up: remove nulls, trim strings
    const clean: Record<string, string> = {};
    const fieldsToKeep = logoOnly ? ["companyName"] : missingFields;
    for (const field of fieldsToKeep) {
      const value = extracted[field];
      if (value && typeof value === "string" && value.trim().length > 0) {
        clean[field] = value.trim();
      }
    }

    console.log(
      logoOnly
        ? `🤖 Logo identified: ${clean.companyName || "unknown"}`
        : `🤖 OpenAI extracted ${Object.keys(clean).length}/${missingFields.length} fields`,
    );

    return NextResponse.json({
      success: true,
      extracted: clean,
      usage: data.usage,
    });
  } catch (err) {
    console.error("AI extract error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to extract" },
      { status: 500 },
    );
  }
}