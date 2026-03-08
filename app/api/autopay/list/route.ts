//app/api/autopay/list/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || "";
    const tab = searchParams.get("tab") || "pending"; // "pending" | "completed"

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // Build query
    type QueryFilter = Record<string, unknown>;
    const query: QueryFilter = {};

    if (tab === "completed") {
      query.completed = true;
    } else {
      query.$or = [{ completed: false }, { completed: { $exists: false } }];
    }

    if (search.trim()) {
      const searchRegex = { $regex: search.replace(/\D/g, ""), $options: "i" };
      query.$and = [
        { ...(tab === "completed" ? { completed: true } : { $or: [{ completed: false }, { completed: { $exists: false } }] }) },
        {
          $or: [
            { customerName: { $regex: search, $options: "i" } },
            { customerPhone: searchRegex },
          ],
        },
      ];
      delete query.completed;
      delete query.$or;
    }

    const total = await autopayCollection.countDocuments(query);
    const newCount = await autopayCollection.countDocuments({ ...query, accessLog: { $exists: false } });

    const customers = await autopayCollection
      .find(query)
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
        completed: 1,
      })
      .sort({ accessLog: 1, createdAt: -1 }) // unviewed first, then newest
      .skip(limit === 0 ? 0 : skip)
      .limit(limit === 0 ? 0 : limit)
      .toArray();

    const customersWithViewed = customers.map(({ accessLog, ...rest }) => ({
      ...rest,
      viewed: Array.isArray(accessLog) && accessLog.length > 0,
    }));

    return NextResponse.json({
      success: true,
      customers: customersWithViewed,
      total,
      newCount,
      skip,
      limit,
    });

  } catch (error) {
    console.error('❌ List autopay error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}