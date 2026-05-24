// app/api/companies-sync/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
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

// Normalize a company name for fuzzy comparison.
// Lowercase, strip punctuation, collapse whitespace.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-()'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a Map of normalized → canonical so we can detect likely duplicates.
function buildNormalizedMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  names.forEach((n) => {
    if (n && n.trim()) map.set(normalize(n), n);
  });
  return map;
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
      const existingMatch = existingNormalized.get(norm);
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
      if (existingNormalized.has(norm) && !approvedSet.has(trimmed)) return;
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