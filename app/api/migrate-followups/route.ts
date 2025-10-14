import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

type FollowUp = {
  date: string;
  type: string;
  description: string;
  status: string;
  method: string;
};

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateFollowUps(dueDate: Date, paymentType: string): FollowUp[] {
  const followUps: FollowUp[] = [];

  if (paymentType === "regular") {
    followUps.push(
      { date: addDays(dueDate, -3).toISOString(), type: "pre-reminder", description: "Upcoming payment reminder", status: "pending", method: "sms" },
      { date: dueDate.toISOString(), type: "due-date", description: "Payment due today", status: "pending", method: "phone" },
      { date: addDays(dueDate, 5).toISOString(), type: "overdue", description: "Still unpaid - follow up", status: "pending", method: "sms" },
      { date: addDays(dueDate, 7).toISOString(), type: "overdue", description: "Second follow-up", status: "pending", method: "sms" },
      { date: addDays(dueDate, 9).toISOString(), type: "final", description: "Final reminder (last day)", status: "pending", method: "phone" },
      { date: addDays(dueDate, 12).toISOString(), type: "post-cancellation", description: "First reinstatement opportunity", status: "pending", method: "phone" },
      { date: addDays(dueDate, 14).toISOString(), type: "post-cancellation", description: "Second reinstatement opportunity", status: "pending", method: "phone" }
    );
  } else if (paymentType === "autopay") {
    followUps.push(
      { date: addDays(dueDate, -3).toISOString(), type: "pre-check", description: "Check autopay schedule", status: "pending", method: "sms" },
      { date: dueDate.toISOString(), type: "due-date", description: "Confirm autopay succeeded", status: "pending", method: "sms" },
      { date: addDays(dueDate, 7).toISOString(), type: "verification", description: "Verify payment posted correctly", status: "pending", method: "email" }
    );
  } else if (paymentType === "paid-in-full") {
    followUps.push(
      { date: addDays(dueDate, -20).toISOString(), type: "renewal", description: "Check renewal pricing & inform", status: "pending", method: "phone" }
    );
  }

  return followUps;
}

export async function POST() {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    
    const customers = await db
      .collection('payment_reminder_coll')
      .find({ status: { $in: ['active', 'overdue'] } })
      .toArray();

    let updatedCount = 0;

    for (const customer of customers) {
      const dueDate = new Date(customer.dueDate);
      const newFollowUps = generateFollowUps(dueDate, customer.paymentType);

      await db.collection('payment_reminder_coll').updateOne(
        { _id: customer._id },
        { $set: { followUps: newFollowUps } }
      );

      updatedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${updatedCount} customers with new follow-up rules` 
    });
  } catch (error) {
    console.error('Error migrating follow-ups:', error);
    return NextResponse.json(
      { error: 'Failed to migrate follow-ups' },
      { status: 500 }
    );
  }
}