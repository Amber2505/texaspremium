import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("db");

    // Get all active customers from customer_policyandclaim_info
    const allCustomers = await db
      .collection("customer_policyandclaim_info")
      .find({ active: true, status: { $ne: "CANCELLED" } })
      .sort({ created_date: -1 })
      .toArray();

    // Get all existing reminders from payment_reminder_coll
    const existingReminders = await db
      .collection("payment_reminder_coll")
      .find({})
      .project({ id: 1 })
      .toArray();

    // Create a Set of policy numbers that already have reminders
    const existingPolicyNumbers = new Set(
      existingReminders.map((r) => r.id).filter(Boolean)
    );

    // Filter out customers that already have reminders
    const pendingCustomers = allCustomers
      .filter(
        (customer) =>
          customer.policy_no && !existingPolicyNumbers.has(customer.policy_no)
      )
      .map((customer) => {
        // Convert dates to YYYY-MM-DD format in UTC to avoid timezone shifts
        const effectiveDate = new Date(customer.effective_date);
        const expirationDate = new Date(customer.expiration_date);
        
        return {
          _id: customer._id.toString(),
          customer_name: customer.customer_name,
          policy_no: customer.policy_no,
          company_name: customer.company_name,
          coverage_type: customer.coverage_type,
          effective_date: effectiveDate.toISOString().split('T')[0], // YYYY-MM-DD only
          expiration_date: expirationDate.toISOString().split('T')[0], // YYYY-MM-DD only
        };
      });

    return NextResponse.json(pendingCustomers, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error("Error fetching pending customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending customers" },
      { status: 500 }
    );
  }
}