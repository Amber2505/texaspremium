// app/api/companies-sync/route.ts
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI!;
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) throw new Error('Please add your Mongo URI to .env.local');

if (process.env.NODE_ENV === 'development') {
  const g = global as typeof globalThis & { _mongoClientPromise?: Promise<MongoClient> };
  if (!g._mongoClientPromise) {
    client = new MongoClient(uri);
    g._mongoClientPromise = client.connect();
  }
  clientPromise = g._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

// Words that carry no identifying information — two carriers are the same
// whether or not someone typed "Inc" or "Insurance Company" on the end.
const NOISE_WORDS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'co',
  'company', 'insurance', 'insurers', 'assurance', 'underwriters',
  'underwriting', 'group', 'agency', 'general', 'mga', 'services',
  'the', 'of', 'and',
]);

// Normalize a company name down to its identifying core.
// Lowercase → strip punctuation → drop noise words → REMOVE ALL SPACES.
// Removing spaces catches "Assurance America" vs "AssuranceAmerica".
function normalize(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[.,\-()'"&/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !NOISE_WORDS.has(w));

  // If stripping noise leaves nothing, fall back to the punctuation-stripped form
  if (words.length === 0) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return words.join('');
}

// Levenshtein distance — catches typos like "Causalty" vs "Casualty".
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

// Two normalized names are "close enough" if one contains the other
// (Loop ⊂ LoopMobility) or they're within a small edit distance (typos).
function isLikelyDuplicate(a: string, b: string): boolean {
  if (a === b) return true;

  // Containment — but only when the shorter is substantial enough to be
  // meaningful. "Loop" (4 chars) inside "loopmobility" counts; "co" doesn't.
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;

  // Typo tolerance — scale with length so short names aren't over-matched
  const maxLen = Math.max(a.length, b.length);
  const threshold = maxLen <= 8 ? 1 : maxLen <= 16 ? 2 : 3;
  return levenshtein(a, b) <= threshold;
}

// Build a Map of normalized → canonical so we can detect likely duplicates.
function buildNormalizedMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  names.forEach((n) => {
    if (n && n.trim()) map.set(normalize(n), n);
  });
  return map;
}

// Find an existing company whose normalized name is close to `norm`.
function findExistingMatch(
  norm: string,
  existingNormalized: Map<string, string>
): string | null {
  const exact = existingNormalized.get(norm);
  if (exact) return exact;

  for (const [existingNorm, canonical] of existingNormalized) {
    if (isLikelyDuplicate(norm, existingNorm)) return canonical;
  }
  return null;
}

// GET /api/companies-sync — preview what a sync would do
export async function GET() {
  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db('db');

    const policyNames: string[] = await db
      .collection('customer_policyandclaim_info')
      .distinct('company_name');
    const existingNames: string[] = await db
      .collection('company_database')
      .distinct('name');

    const existingExact = new Set(existingNames.map((n) => n.trim()));
    const existingNormalized = buildNormalizedMap(existingNames);

    const cleanNew: string[] = [];
    const likelyDuplicates: { policyName: string; matchesExisting: string }[] = [];

    policyNames.forEach((name) => {
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (existingExact.has(trimmed)) return; // already there exactly

      const norm = normalize(trimmed);
      const existingMatch = findExistingMatch(norm, existingNormalized);
      if (existingMatch) {
        likelyDuplicates.push({ policyName: trimmed, matchesExisting: existingMatch });
      } else {
        cleanNew.push(trimmed);
      }
    });

    return NextResponse.json({
      cleanNew, // safe to auto-add
      likelyDuplicates, // need human review
      counts: { cleanNew: cleanNew.length, likelyDuplicates: likelyDuplicates.length },
    });
  } catch (error) {
    console.error('Sync preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/companies-sync — actually perform the sync
// Body: { confirm: true, additionalNames?: string[] }
// additionalNames lets you opt in to adding specific "likely duplicate" entries
// (e.g. if "Loop" really is a different carrier from "Loop Mobility, Inc").
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { confirm, additionalNames = [] } = body as {
      confirm?: boolean;
      additionalNames?: string[];
    };

    if (!confirm) {
      return NextResponse.json(
        { error: 'Must POST { confirm: true } to perform sync' },
        { status: 400 }
      );
    }

    const mongoClient = await clientPromise;
    const db = mongoClient.db('db');

    const policyNames: string[] = await db
      .collection('customer_policyandclaim_info')
      .distinct('company_name');
    const existingNames: string[] = await db
      .collection('company_database')
      .distinct('name');

    const existingExact = new Set(existingNames.map((n) => n.trim()));
    const existingNormalized = buildNormalizedMap(existingNames);

    // Only add names that have no normalized match, plus anything the caller
    // explicitly approved via additionalNames.
    const approvedSet = new Set(additionalNames.map((n) => n.trim()));

    const toAdd: string[] = [];
    policyNames.forEach((name) => {
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (existingExact.has(trimmed)) return;
      const norm = normalize(trimmed);
      const match = findExistingMatch(norm, existingNormalized);
      if (match && !approvedSet.has(trimmed)) return;
      toAdd.push(trimmed);
    });

    if (toAdd.length === 0) {
      return NextResponse.json({ success: true, addedCount: 0, added: [] });
    }

    const now = new Date();
    const docs = toAdd.map((name) => ({
      name,
      paymentLink: '',
      claimLink: '',
      claimPhone: '',
      createdAt: now,
      updatedAt: now,
      autoAdded: true,
    }));

    await db.collection('company_database').insertMany(docs);

    return NextResponse.json({
      success: true,
      addedCount: toAdd.length,
      added: toAdd,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}