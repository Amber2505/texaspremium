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

      systemPrompt = `You are a data extractor for insurance policy documents. You will be shown page 1 of an insurance policy package. Extract ONLY the fields requested. Pay special attention to company logos — many carriers show their name only as a logo image, not as text. Return a JSON object with the field names as keys and extracted values as strings. If a field truly cannot be found, set its value to null. Do not guess. Do not include any other text or explanation — only the JSON object.`;
      userPrompt = `Extract these fields from the document image:\n${requestedFields}\n\nReturn ONLY a JSON object like {"fieldName": "value"} with no additional text, markdown, or code fences.`;
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