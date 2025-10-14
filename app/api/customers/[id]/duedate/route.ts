import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

// Define the FollowUp type
type FollowUp = {
  date: string;
  type: string;
  description: string;
  status: string;
  method: string;
};

function generateFollowUps(dueDate: Date, paymentType: string): FollowUp[] {
  const followUps: FollowUp[] = []; // Use FollowUp type instead of any[]

  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  if (paymentType === "regular") {
    followUps.push(
      { date: addDays(dueDate, -2).toISOString(), type: "pre-reminder", description: "Upcoming payment reminder", status: "pending", method: "email" },
      { date: dueDate.toISOString(), type: "due-date", description: "Payment due today", status: "pending", method: "phone" },
      { date: addDays(dueDate, 5).toISOString(), type: "overdue", description: "Still unpaid - follow up", status: "pending", method: "phone" },
      { date: addDays(dueDate, 7).toISOString(), type: "overdue", description: "Second follow-up", status: "pending", method: "sms" },
      { date: addDays(dueDate, 9).toISOString(), type: "final", description: "Final reminder (last day)", status: "pending", method: "phone" }
    );
  } else if (paymentType === "autopay") {
    followUps.push(
      { date: addDays(dueDate, -2).toISOString(), type: "pre-check", description: "Check autopay schedule", status: "pending", method: "email" },
      { date: dueDate.toISOString(), type: "due-date", description: "Confirm autopay succeeded", status: "pending", method: "email" },
      { date: addDays(dueDate, 7).toISOString(), type: "verification", description: "Verify payment posted correctly", status: "pending", method: "email" }
    );
  } else if (paymentType === "paid-in-full") {
    followUps.push(
      { date: addDays(dueDate, -20).toISOString(), type: "renewal", description: "Check renewal pricing & inform", status: "pending", method: "phone" }
    );
  }

  return followUps;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const { dueDate } = await request.json();

    const customer = await db.collection('payment_reminder_coll').findOne({ id: params.id });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Parse the date properly to avoid timezone shift
    const newDueDate = new Date(dueDate);
    newDueDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues

    const followUps = generateFollowUps(newDueDate, customer.paymentType);

    await db.collection('payment_reminder_coll').updateOne(
      { id: params.id },
      {
        $set: {
          dueDate: newDueDate.toISOString(),
          paymentDayOfMonth: newDueDate.getDate(),
          followUps,
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating due date:', error);
    return NextResponse.json({ error: 'Failed to update due date' }, { status: 500 });
  }
}