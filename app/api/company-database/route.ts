/* eslint-disable @typescript-eslint/no-unused-vars */
import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

// 1. Connection setup
const uri = process.env.MONGODB_URI!;
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

// Ensure we reuse the connection in development to prevent memory leaks
if (process.env.NODE_ENV === 'development') {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

interface CompanyData {
  name: string;
  paymentLink: string;
  claimLink: string;
  claimPhone: string;
  createdAt?: string; // ✅ Added
  updatedAt?: string; // ✅ Added
}

export async function GET() {
  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db('db');
    
    const companiesArray = await db
      .collection('company_database')
      .find({})
      .toArray();

    const companyDatabase: Record<string, CompanyData> = {};
    
    companiesArray.forEach((doc) => {
      const name = doc.name || doc['Company Name'];
      if (name) {
        companyDatabase[name] = {
          name: name,
          paymentLink: doc.paymentLink || doc['Payment Link'] || '',
          claimLink: doc.claimLink || doc['Claim Link'] || '',
          claimPhone: doc.claimPhone || doc['Claim Phone'] || '',
          createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined, // ✅ Added
          updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined, // ✅ Added
        };
      }
    });

    return NextResponse.json({
      companies: companyDatabase,
      meta: {
        totalCompanies: Object.keys(companyDatabase).length,
        source: 'mongodb'
      }
    });
  } catch (error) {
    console.error('MongoDB Error:', error);
    return NextResponse.json({
      error: 'Failed to fetch from MongoDB',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// ✅ POST endpoint for Add/Update
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, paymentLink, claimLink, claimPhone } = body;

    if (!name) {
      return NextResponse.json({
        error: 'Company name is required'
      }, { status: 400 });
    }

    const mongoClient = await clientPromise;
    const db = mongoClient.db('db');
    const collection = db.collection('company_database');

    const company = {
      name,
      paymentLink: paymentLink || '',
      claimLink: claimLink || '',
      claimPhone: claimPhone || '',
      updatedAt: new Date() // ✅ Always update this
    };

    // Upsert: update if exists, insert if not
    const result = await collection.updateOne(
      { name },
      {
        $set: company,
        $setOnInsert: { createdAt: new Date() } // ✅ Only set on insert
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: result.upsertedCount > 0 ? 'Company created' : 'Company updated',
      company
    });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({
      error: 'Failed to save company',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// ✅ DELETE endpoint
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({
        error: 'Company name is required'
      }, { status: 400 });
    }

    const mongoClient = await clientPromise;
    const db = mongoClient.db('db');
    const collection = db.collection('company_database');

    const result = await collection.deleteOne({ name });

    if (result.deletedCount === 0) {
      return NextResponse.json({
        error: 'Company not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Company deleted',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({
      error: 'Failed to delete company',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}