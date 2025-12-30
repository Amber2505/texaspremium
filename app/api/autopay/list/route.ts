import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET() {
  try {
    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // ✅ FIXED: Only use inclusion (1) - MongoDB projection
    const customers = await autopayCollection
      .find({})
      .project({
        _id: 1,
        customerName: 1,
        customerEmail: 1,
        method: 1,
        status: 1,
        createdAt: 1,
        transactionId: 1,
        cardLast4: 1,
        cardBrand: 1,
        accountLast4: 1,
        accountType: 1,
        // Encrypted fields automatically excluded by not listing them
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      customers,
      total: customers.length,
    });

  } catch (error) {
    console.error('❌ List autopay error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}