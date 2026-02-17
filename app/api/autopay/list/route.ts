import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET() {
  try {
    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    const customers = await autopayCollection
    .find({})
    .project({
        _id: 1,
        customerName: 1,
        customerPhone: 1,
        customerEmail: 1,
        method: 1,
        status: 1,
        createdAt: 1,
        transactionId: 1,
        cardLast4: 1,
        cardBrand: 1,
        accountLast4: 1,
        accountType: 1,
        accessLog: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();

// Add viewed flag based on accessLog, remove accessLog from response
const customersWithViewed = customers.map(({ accessLog, ...rest }) => ({
    ...rest,
    viewed: Array.isArray(accessLog) && accessLog.length > 0,
}));

return NextResponse.json({
    success: true,
    customers: customersWithViewed,
    total: customersWithViewed.length,
});

  } catch (error) {
    console.error('❌ List autopay error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}