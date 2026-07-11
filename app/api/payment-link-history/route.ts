// app/api/payment-link-history/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const PAGE_SIZE = 25;

export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "all"; // all | paid | unpaid

    client = await MongoClient.connect(uri);
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
      // ── Search mode: scan all matching records, no pagination ─────────────
      const all = await collection
        .find(baseQuery)
        .sort({ createdAtTimestamp: -1 })
        .toArray();

      const q = search.toLowerCase();
      const digits = q.replace(/\D/g, "");

      const filtered = all.filter((link) => {
        const phone = (link.customerPhone || "").replace(/\D/g, "");
        const email = (link.customerEmail || "").toLowerCase();
        const desc = (link.description || "").toLowerCase();
        const amount = link.amount
          ? (link.amount / 100).toFixed(2)
          : "";

        return (
          (digits && phone.includes(digits)) ||
          email.includes(q) ||
          desc.includes(q) ||
          amount.includes(q)
        );
      });

      return NextResponse.json({
        success: true,
        links: filtered,
        total: filtered.length,
        page: 1,
        totalPages: 1,
        isSearch: true,
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
  } finally {
    if (client) await client.close();
  }
}