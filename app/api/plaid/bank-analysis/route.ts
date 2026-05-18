// app/api/plaid/bank-analysis/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2026-05"

  try {
    const client = await clientPromise;
    const db = client.db("db");

    // Get all bank transactions, filtered by month if provided
    const txQuery: any = {};
    if (month) {
      txQuery.date = { $regex: `^${month}` };
    }

    const transactions = await db
      .collection("bank_transactions")
      .find(txQuery)
      .sort({ date: -1 })
      .toArray();

    // Categorize transactions
    const deposits = transactions.filter((tx) => tx.amount < 0); // Plaid: negative = money IN
    const withdrawals = transactions.filter((tx) => tx.amount > 0); // positive = money OUT
    const pending = transactions.filter((tx) => tx.pending === true);

    // Find Square deposits specifically
    const squareDeposits = deposits.filter((tx) => {
      const name = (tx.name || tx.merchant_name || "").toLowerCase();
      return name.includes("square") || name.includes("sq *");
    });

    // Find Square fees/withdrawals
    const squareFees = withdrawals.filter((tx) => {
      const name = (tx.name || tx.merchant_name || "").toLowerCase();
      return name.includes("square") || name.includes("sq *");
    });

    // Cash deposits (non-Square, non-Zelle deposits)
    const cashDeposits = deposits.filter((tx) => {
      const name = (tx.name || tx.merchant_name || "").toLowerCase();
      return !name.includes("square") && !name.includes("sq *") &&
             !name.includes("zelle") && !name.includes("venmo") &&
             !name.includes("paypal");
    });

    // Zelle deposits
    const zelleDeposits = deposits.filter((tx) => {
      const name = (tx.name || tx.merchant_name || "").toLowerCase();
      return name.includes("zelle");
    });

    // Totals
    const totalDeposited = deposits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const totalWithdrawn = withdrawals.reduce((s, tx) => s + tx.amount, 0);
    const totalSquareDeposited = squareDeposits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const totalSquareFees = squareFees.reduce((s, tx) => s + tx.amount, 0);
    const totalCashDeposited = cashDeposits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const totalZelleDeposited = zelleDeposits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const totalPendingAmount = pending.reduce((s, tx) => s + Math.abs(tx.amount), 0);

    // Get Square payout data from MongoDB if available
    // Cross-reference: match Square payout dates to bank deposit dates
    const squarePayoutDates = squareDeposits.map((tx) => tx.date);

    return NextResponse.json({
      summary: {
        totalDeposited,
        totalWithdrawn,
        totalSquareDeposited,
        totalSquareFees,
        totalCashDeposited,
        totalZelleDeposited,
        totalPendingAmount,
        pendingCount: pending.length,
        netCashFlow: totalDeposited - totalWithdrawn,
      },
      squareDeposits: squareDeposits.slice(0, 20),
      squareFees: squareFees.slice(0, 10),
      cashDeposits: cashDeposits.slice(0, 20),
      zelleDeposits: zelleDeposits.slice(0, 20),
      pending: pending.slice(0, 20),
      squarePayoutDates,
    });
  } catch (error: any) {
    console.error("Bank analysis error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}