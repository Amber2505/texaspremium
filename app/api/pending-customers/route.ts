import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    
    // Get all active customers from customer_policyandclaim_info
    const allCustomers = await db
      .collection('customer_policyandclaim_info')
      .find({ active: true, status: 'ACTIVE' })
      .sort({ created_date: -1 }) // Show newest first
      .toArray();
    
    // Get all existing reminders from payment_reminder_coll
    const existingReminders = await db
      .collection('payment_reminder_coll')
      .find({})
      .project({ id: 1 }) // Only fetch the id field for efficiency
      .toArray();
    
    // Create a Set of policy numbers that already have reminders
    const existingPolicyNumbers = new Set(
      existingReminders.map((r) => r.id).filter(Boolean) // Filter out any null/undefined
    );
    
    // Filter out customers that already have reminders
    const pendingCustomers = allCustomers.filter(
      (customer) => customer.policy_no && !existingPolicyNumbers.has(customer.policy_no)
    );
    
    console.log(`Found ${pendingCustomers.length} pending customers out of ${allCustomers.length} total active customers`);
    
    return NextResponse.json(pendingCustomers);
  } catch (error) {
    console.error('Error fetching pending customers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending customers' },
      { status: 500 }
    );
  }
}