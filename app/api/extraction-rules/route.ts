// app/api/extraction-rules/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";

const FIELDS = [
  "policyNumber",
  "companyName",
  "insuredName",
  "effectiveDate",
  "expirationDate",
] as const;

type ExtractionField = (typeof FIELDS)[number];

interface ExtractionRule {
  field: ExtractionField;
  // The chunk of text the user clicked — we match this verbatim
  // (after normalizing whitespace). The chunk IS the value, OR we extract
  // a value from within it using a field-specific sub-pattern.
  matchedChunk: string;
  // Normalized value the user confirmed (e.g. "4368264-TX-PP-001")
  extractedValue: string;
  // A small amount of context before/after the chunk — helps disambiguate
  // when the same text appears multiple times in a document
  contextBefore: string;
  contextAfter: string;
  createdAt: Date;
  version: number;
}

interface CarrierRuleDoc {
  carrierFingerprint: string;
  carrierLabel: string;
  rules: ExtractionRule[];
  createdAt: Date;
  updatedAt: Date;
}

// ═════════════════════════════════════════════════════════════════════════
// GET /api/extraction-rules?fingerprint=X
// Returns the saved rules for a given carrier fingerprint, or null.
// ═════════════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  const { searchParams } = new URL(request.url);
  const fingerprint = searchParams.get("fingerprint");

  if (!fingerprint) {
    return NextResponse.json(
      { error: "Missing fingerprint parameter" },
      { status: 400 }
    );
  }

  let mongoClient: MongoClient | null = null;
  try {
    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection<CarrierRuleDoc>("pdf-extraction-rules");

    const doc = await collection.findOne({ carrierFingerprint: fingerprint });

    await mongoClient.close();

    if (!doc) {
      return NextResponse.json({ success: true, rules: null });
    }

    return NextResponse.json({
      success: true,
      rules: {
        carrierFingerprint: doc.carrierFingerprint,
        carrierLabel: doc.carrierLabel,
        rules: doc.rules,
      },
    });
  } catch (err) {
    console.error("Load extraction rules error:", err);
    if (mongoClient) await mongoClient.close();
    return NextResponse.json(
      { success: false, error: "Failed to load rules" },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
// POST /api/extraction-rules
// Body: { carrierFingerprint, carrierLabel, field, matchedChunk,
//         extractedValue, contextBefore, contextAfter }
// Appends a new rule for the field (versioned). Creates doc if needed.
// ═════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  let mongoClient: MongoClient | null = null;
  try {
    const body = await request.json();
    const {
      carrierFingerprint,
      carrierLabel,
      field,
      matchedChunk,
      extractedValue,
      contextBefore,
      contextAfter,
    } = body;

    if (!carrierFingerprint || !field || !extractedValue) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields (carrierFingerprint, field, extractedValue)",
        },
        { status: 400 }
      );
    }

    if (!FIELDS.includes(field)) {
      return NextResponse.json(
        { success: false, error: `Unknown field: ${field}` },
        { status: 400 }
      );
    }

    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection<CarrierRuleDoc>("pdf-extraction-rules");

    const now = new Date();
    const existing = await collection.findOne({ carrierFingerprint });

    // Determine the next version number for this specific field
    const existingFieldRules =
      existing?.rules.filter((r) => r.field === field) || [];
    const nextVersion = existingFieldRules.length + 1;

    const newRule: ExtractionRule = {
      field,
      matchedChunk: (matchedChunk || "").trim(),
      extractedValue: extractedValue.trim(),
      contextBefore: (contextBefore || "").trim(),
      contextAfter: (contextAfter || "").trim(),
      createdAt: now,
      version: nextVersion,
    };

    if (existing) {
      // Append the new rule, update the carrier label if it changed
      await collection.updateOne(
        { carrierFingerprint },
        {
          $push: { rules: newRule },
          $set: {
            updatedAt: now,
            carrierLabel: carrierLabel || existing.carrierLabel,
          },
        }
      );
    } else {
      // Create a new carrier doc
      const newDoc: CarrierRuleDoc = {
        carrierFingerprint,
        carrierLabel: carrierLabel || "Unknown carrier",
        rules: [newRule],
        createdAt: now,
        updatedAt: now,
      };
      await collection.insertOne(newDoc);
    }

    await mongoClient.close();

    return NextResponse.json({
      success: true,
      field,
      version: nextVersion,
    });
  } catch (err) {
    console.error("Save extraction rule error:", err);
    if (mongoClient) await mongoClient.close();
    return NextResponse.json(
      { success: false, error: "Failed to save rule" },
      { status: 500 }
    );
  }
}