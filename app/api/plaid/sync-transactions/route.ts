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

export async function POST() {
  const client = await clientPromise;
  const db = client.db("db");

  // Get stored access token
  const config = await db.collection("plaid_config").findOne({ key: "chase_access_token" });
  if (!config) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  // Get last 60 days of transactions
  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const response = await plaidClient.transactionsGet({
    access_token: config.access_token,
    start_date: start,
    end_date: end,
  });

  const transactions = response.data.transactions;

  // Upsert each transaction to MongoDB
  for (const tx of transactions) {
    await db.collection("bank_transactions").updateOne(
      { transaction_id: tx.transaction_id },
      { $set: { ...tx, syncedAt: new Date() } },
      { upsert: true }
    );
  }

  return NextResponse.json({ synced: transactions.length });
}