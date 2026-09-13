// app/api/payment-link-history/route.ts
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";


const PAGE_SIZE = 25;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "all"; // all | paid | unpaid

    // Pooled client — MongoClient.connect per request meant a full TLS +
    // auth handshake before every query, on every keystroke in search mode.
    const client = await connectToDatabase;
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Only payment links can be paid/unpaid — autopay-only links have no payment stage
    const paidQuery = { "completedStages.payment": true };
    const unpaidQuery = {
      linkType: "payment",
      $or: [
        { "completedStages.payment": { $exists: false } },
        { "completedStages.payment": false },
        { "completedStages.payment": null },
        { completedStages: { $exists: false } },
      ],
    };
    const baseQuery: Record<string, unknown> =
      status === "paid" ? paidQuery : status === "unpaid" ? unpaidQuery : {};

    if (search) {
      // ── Search mode ──────────────────────────────────────────────────────
      // This used to .toArray() the whole collection and filter in Node, on
      // every keystroke. Push it into Mongo instead.
      const esc = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const digits = search.replace(/\D/g, "");

      const or: Record<string, unknown>[] = [
        { customerEmail: { $regex: esc, $options: "i" } },
        { description: { $regex: esc, $options: "i" } },
      ];

      // customerPhone is stored unformatted, so digits match it directly
      if (digits) {
        or.push({ customerPhone: { $regex: digits } });
      }

      // Amount is stored in cents; "45.50" and "45" should both hit
      const asNumber = parseFloat(search);
      if (!isNaN(asNumber)) {
        or.push({ amount: Math.round(asNumber * 100) });
      }

      const searchQueryDoc =
        Object.keys(baseQuery).length > 0
          ? { $and: [baseQuery, { $or: or }] }
          : { $or: or };

      const SEARCH_LIMIT = 200;
      const filtered = await collection
        .find(searchQueryDoc)
        .sort({ createdAtTimestamp: -1 })
        .limit(SEARCH_LIMIT)
        .toArray();

      return NextResponse.json({
        success: true,
        links: filtered,
        total: filtered.length,
        page: 1,
        totalPages: 1,
        isSearch: true,
        truncated: filtered.length === SEARCH_LIMIT,
      });
    }

    // ── Paginated mode ────────────────────────────────────────────────────────
    const total = await collection.countDocuments(baseQuery);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);

    const links = await collection
      .find(baseQuery)
      .sort({ createdAtTimestamp: -1 })
      .skip((safePage - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray();

    return NextResponse.json({
      success: true,
      links,
      total,
      page: safePage,
      totalPages,
      isSearch: false,
    });
  } catch (error: unknown) {
    console.error("Error fetching payment link history:", error);
    return NextResponse.json(
      { error: "Failed to fetch link history" },
      { status: 500 }
    );
  }
}