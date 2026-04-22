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
  matchedChunk: string;
  extractedValue: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: Date;
  version: number;
  isStatic?: boolean;
  logoHash?: string;
}

interface CarrierRuleDoc {
  carrierFingerprint: string;
  carrierLabel: string;
  rules: ExtractionRule[];
  createdAt: Date;
  updatedAt: Date;
}

// Hamming distance between two hex strings of equal length
const hashDistance = (a: string, b: string): number => {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
};

// ═════════════════════════════════════════════════════════════════════════
// GET /api/extraction-rules?fingerprint=X&logoHashes=hash1,hash2,...
// Returns saved rules, first trying fingerprint match, then logo-hash match.
// ═════════════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const authFail = requireAdmin(request);
  if (authFail) return authFail;

  const { searchParams } = new URL(request.url);
  const fingerprint = searchParams.get("fingerprint");
  const logoHashesParam = searchParams.get("logoHashes");
  const logoHashes = logoHashesParam
    ? logoHashesParam.split(",").filter((h) => h.length > 0)
    : [];

  if (!fingerprint) {
    return NextResponse.json(
      { error: "Missing fingerprint parameter" },
      { status: 400 },
    );
  }

  let mongoClient: MongoClient | null = null;
  try {
    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection<CarrierRuleDoc>("pdf-extraction-rules");

    // 1. Try exact fingerprint match first
    let doc = await collection.findOne({ carrierFingerprint: fingerprint });
    let matchedBy: "fingerprint" | "logoHash" | null = doc
      ? "fingerprint"
      : null;

    // 2. If no fingerprint match AND we have logo hashes, scan all carriers
    //    for a logo-hash match. Hamming distance <= 12 (out of 256) = same logo.
    if (!doc && logoHashes.length > 0) {
      const allCarriers = await collection
        .find({ "rules.logoHash": { $exists: true, $ne: "" } })
        .toArray();
      for (const carrier of allCarriers) {
        for (const rule of carrier.rules) {
          if (!rule.logoHash) continue;
          for (const pageHash of logoHashes) {
            if (hashDistance(pageHash, rule.logoHash) <= 12) {
              doc = carrier;
              matchedBy = "logoHash";
              break;
            }
          }
          if (doc) break;
        }
        if (doc) break;
      }
    }

    await mongoClient.close();

    if (!doc) {
      return NextResponse.json({ success: true, rules: null });
    }

    return NextResponse.json({
      success: true,
      matchedBy,
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
      { status: 500 },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
// POST /api/extraction-rules
// Body: { carrierFingerprint, carrierLabel, field, matchedChunk,
//         extractedValue, contextBefore, contextAfter,
//         isStatic?, logoHash? }
// Appends a new rule (versioned per field). Creates carrier doc if needed.
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
      isStatic,
      logoHash,
    } = body;

    if (!carrierFingerprint || !field || !extractedValue) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields (carrierFingerprint, field, extractedValue)",
        },
        { status: 400 },
      );
    }

    if (!FIELDS.includes(field)) {
      return NextResponse.json(
        { success: false, error: `Unknown field: ${field}` },
        { status: 400 },
      );
    }

    mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
    const db = mongoClient.db("db");
    const collection = db.collection<CarrierRuleDoc>("pdf-extraction-rules");

    const now = new Date();
    const existing = await collection.findOne({ carrierFingerprint });

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
      ...(isStatic ? { isStatic: true } : {}),
      ...(logoHash ? { logoHash } : {}),
    };

    if (existing) {
      // Dedupe: if a static rule with same field + same logoHash already
      // exists, skip the save (prevents growing the rules array on each
      // identical upload)
      const duplicate = existing.rules.find(
        (r) =>
          r.field === field &&
          r.isStatic &&
          r.logoHash &&
          logoHash &&
          r.logoHash === logoHash,
      );
      if (duplicate) {
        await mongoClient.close();
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "Duplicate logo-hash rule already exists",
        });
      }

      await collection.updateOne(
        { carrierFingerprint },
        {
          $push: { rules: newRule },
          $set: {
            updatedAt: now,
            carrierLabel: carrierLabel || existing.carrierLabel,
          },
        },
      );
    } else {
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
      { status: 500 },
    );
  }
}