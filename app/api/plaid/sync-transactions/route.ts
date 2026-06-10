// app/api/plaid/sync-transactions/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { PlaidApi, PlaidEnvironments, Configuration } from "plaid";
import clientPromise from "@/lib/mongodb";

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
}));

export async function POST(request: Request) {
  const client = await clientPromise;
  const db = client.db("db");

  const config = await db.collection("plaid_config").findOne({ key: "chase_access_token" });
  if (!config) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  // Optional ?start=YYYY-MM-DD overrides the default 90-day window.
  // Used for one-time backfills (e.g. ?start=2025-05-01).
  // Daily cron passes nothing → falls back to 90 days.
  const { searchParams } = new URL(request.url);
  const startOverride = searchParams.get("start");

  const end = new Date().toISOString().split("T")[0];
  const start = startOverride
    ? startOverride
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  console.log(`📅 Plaid sync window: ${start} → ${end}`);

  try {
    // Paginate through ALL transactions
    const allTransactions: any[] = [];
    let offset = 0;
    const COUNT = 500;

    while (true) {
      const response = await plaidClient.transactionsGet({
        access_token: config.access_token,
        start_date: start,
        end_date: end,
        options: {
          count: COUNT,
          offset,
          include_personal_finance_category: true,
        },
      });

      const transactions = response.data.transactions;
      const total = response.data.total_transactions;

      allTransactions.push(...transactions);
      console.log(`Plaid page: got ${transactions.length}, total so far: ${allTransactions.length} / ${total}`);

      if (allTransactions.length >= total) break;
      offset += transactions.length;

      // Safety cap — Chase shouldn't have more than 2000 transactions in 90 days
      if (offset >= 2000) break;
    }

    // Upsert all to MongoDB
    for (const tx of allTransactions) {
      // 1. If this settled transaction has a pending predecessor, remove it
      if (!tx.pending && tx.pending_transaction_id) {
        await db.collection("bank_transactions").deleteOne({
          transaction_id: tx.pending_transaction_id,
        });
      }

      // 2. Fallback: remove any still-pending record with same amount + name prefix
      //    (catches cases where pending_transaction_id isn't populated)
      if (!tx.pending) {
        const namePrefix = (tx.name || "").substring(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await db.collection("bank_transactions").deleteOne({
          pending: true,
          amount: tx.amount,
          name: { $regex: new RegExp("^" + namePrefix) },
          transaction_id: { $ne: tx.transaction_id },
        });
      }

      // 3. Evict any Chase CSV placeholder for the same transaction
      const namePrefix = (tx.name || "").substring(0, 25).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await db.collection("bank_transactions").deleteOne({
        transaction_id: { $regex: /^chase_csv_/ },
        date: tx.date,
        amount: tx.amount,
        name: { $regex: new RegExp("^" + namePrefix) },
      });

      await db.collection("bank_transactions").updateOne(
        { transaction_id: tx.transaction_id },
        { $set: { ...tx, syncedAt: new Date() } },
        { upsert: true }
      );
    }

    console.log(`✅ Plaid sync complete: ${allTransactions.length} transactions`);
    return NextResponse.json({ synced: allTransactions.length });

  } catch (plaidError: any) {
    const errData = plaidError?.response?.data;
    console.error("Plaid transactionsGet error:", JSON.stringify(errData));
    return NextResponse.json({
      error: errData?.error_code || "Plaid API error",
      message: errData?.error_message || plaidError?.message,
      details: errData,
    }, { status: 400 });
  }
}