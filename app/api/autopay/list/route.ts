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
      const digitsOnly = search.replace(/\D/g, "");
      const tabFilter = tab === "completed"
        ? { completed: true }
        : { $or: [{ completed: false }, { completed: { $exists: false } }] };

      const searchConditions: QueryFilter[] = [
        { customerName: { $regex: search, $options: "i" } },
        { cardBrand: { $regex: search, $options: "i" } },
        { accountType: { $regex: search, $options: "i" } },
        { method: { $regex: search, $options: "i" } },
      ];

      // Only add digit-based searches if there are digits in the query
      if (digitsOnly) {
        searchConditions.push(
          { customerPhone: { $regex: digitsOnly, $options: "i" } },
          { cardLast4: { $regex: digitsOnly, $options: "i" } },
          { accountLast4: { $regex: digitsOnly, $options: "i" } },
        );
      }

      query.$and = [
        tabFilter,
        { $or: searchConditions },
      ];
      delete query.completed;
      delete query.$or;
    }

    const total = await autopayCollection.countDocuments(query);
    const newCount = await autopayCollection.countDocuments({ ...query, accessLog: { $exists: false } });

    const pipeline = [
      { $match: query },
      {
        $addFields: {
          _isViewed: {
            $cond: [
              { $and: [
                { $isArray: "$accessLog" },
                { $gt: [{ $size: { $ifNull: ["$accessLog", []] } }, 0] }
              ]},
              1,
              0
            ]
          }
        }
      },
      { $sort: { _isViewed: 1, createdAt: -1 } },
      ...(limit === 0 ? [] : [{ $skip: skip }, { $limit: limit }]),
      {
        $project: {
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
        }
      }
    ];

    const customers = await autopayCollection.aggregate(pipeline).toArray();

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