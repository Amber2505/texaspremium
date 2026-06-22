/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;
    if (!file) return NextResponse.json({ error: "No PDF" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          {
            type: "file" as any,
            file: {
              filename: file.name || "quote.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
          {
            type: "text",
            text: `You are parsing an auto insurance quote PDF from any company (Alinsco, TurboRater, Kemper, GAINSCO, Progressive, etc).

Read the PDF carefully and extract all data. Return ONLY valid JSON, no markdown, no extra text.

CRITICAL: Only return values that actually appear in the document. Use null for anything not found. Do NOT invent or assume standard values.

Return this exact structure:
{
  "customerName": "First Last or null",
  "customerAddress": "full address city state zip or null",
  "customerPhone": "phone number or null",
  "effectiveDate": "YYYY-MM-DD or null",
  "term": "6 or 12 or null",
  "drivers": [
    {"name": "Full Name", "dateOfBirth": "YYYY-MM-DD or null"}
  ],
  "vehicles": [
    {
      "year": "2005 or null",
      "make": "FORD or null",
      "model": "F150 or null",
      "vin": "17-char VIN or null",
      "coverageType": "liability or full or null",
      "comprehensive": "deductible amount like 500 or null",
      "collision": "deductible amount like 500 or null",
      "rental": "Yes or None",
      "rentalAmount": "amount or null",
      "towing": "Yes or None",
      "towingAmount": "amount or null"
    }
  ],
  "isNonOwner": true or false,
  "bodilyInjury": "30/60 format or null",
  "propertyDamage": "number only like 25 meaning $25000 or null",
  "pip": "dollar amount like 2500 or None",
  "medPay": "dollar amount or None",
  "umbi": "30/60 format or None",
  "umpd": "number only or None",
  "totalPremium": "total policy premium amount or null",
  "downPayment": "down payment amount or null",
  "monthlyPaymentEFT": "monthly/installment payment amount or null"
}

Rules:
- term: "6" for Semi-Annual/6-month, "12" for Annual/12-month
- bodilyInjury: extract the actual limits like "30/60" or "50/100"
- propertyDamage: just the number, e.g. "25" for $25,000
- coverageType: "liability" if comp/collision = None/No Coverage/0, "full" if comp and collision have actual coverage
- comprehensive/collision: actual deductible shown (e.g. "500"), null if no coverage
- pip/medPay/umbi/umpd: "None" if no coverage, otherwise the actual dollar limit
- isNonOwner: true if this is a non-owner policy (no vehicles listed, says "non-owner", "non owner", or "broadform"), false otherwise
- If isNonOwner is true, vehicles array should be empty []
- Include ALL drivers and ALL vehicles found in the document,
- All dates YYYY-MM-DD format`,
          },
        ],
      }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Safe string helper — never returns undefined
    const s = (v: any, fallback = "") => (v == null ? fallback : String(v));

    const result = {
      customerName:    s(parsed.customerName),
      customerAddress: s(parsed.customerAddress),
      customerPhone:   s(parsed.customerPhone),
      effectiveDate:   s(parsed.effectiveDate),
      term:            s(parsed.term),
      drivers: (parsed.drivers ?? []).map((d: any) => ({
        name:          s(d.name),
        dateOfBirth:   s(d.dateOfBirth),
        licenseNumber: "",
      })),
      vehicles: (parsed.vehicles ?? []).map((v: any) => ({
        year:          s(v.year),
        make:          s(v.make),
        model:         s(v.model),
        vin:           s(v.vin),
        coverageType:  v.coverageType === "full" ? "full" : "liability",
        comprehensive: s(v.comprehensive),
        collision:     s(v.collision),
        rental:        v.rental === "Yes" ? "Yes" : "None",
        rentalAmount:  s(v.rentalAmount),
        towing:        v.towing === "Yes" ? "Yes" : "None",
        towingAmount:  s(v.towingAmount),
      })),
      isNonOwner:        !!parsed.isNonOwner,
      bodilyInjury:      s(parsed.bodilyInjury),
      propertyDamage:    s(parsed.propertyDamage),
      pip:               s(parsed.pip, "None"),
      medPay:            s(parsed.medPay, "None"),
      umbi:              s(parsed.umbi, "None"),
      umpd:              s(parsed.umpd, "None"),
      totalPremium:      s(parsed.totalPremium),
      downPayment:       s(parsed.downPayment),
      monthlyPaymentEFT: s(parsed.monthlyPaymentEFT),
    };

    return NextResponse.json({ data: result });
  } catch (err: any) {
    console.error("Insurance PDF parse error:", err);
    return NextResponse.json({ error: err.message ?? "Failed to parse PDF" }, { status: 500 });
  }
}