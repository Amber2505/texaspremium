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

export async function POST(request: Request) {
  try {
    const { customerId } = await request.json();

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('db');

    const customer = await db
      .collection('payment_reminder_coll')
      .findOne({ id: customerId });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    if (customer.paymentType !== 'autopay') {
      return NextResponse.json(
        { error: 'Customer is not on autopay' },
        { status: 400 }
      );
    }

    // CRITICAL: Use the due date as the reference point
    // This is when autopay was declined, not when the user clicked "remove autopay"
    const dueDate = customer.dueDate 
      ? new Date(customer.dueDate)
      : new Date();
    
    const now = new Date();
    const expirationDate = new Date(customer.expirationDate);
    
    // Generate regular payment follow-ups based on the due date (decline date)
    const followUps: FollowUp[] = [];
    
    // Calculate all the reminder dates based on the original due date
    const preReminderDate = addDays(dueDate, -3);  // 3 days before due date
    const dueDateReminder = dueDate;                // Due date itself
    const overdueDay5 = addDays(dueDate, 5);       // 5 days after due date
    const overdueDay7 = addDays(dueDate, 7);       // 7 days after due date
    const finalDay9 = addDays(dueDate, 9);         // 9 days after due date (final reminder)
    const postCancellation12 = addDays(dueDate, 12); // 12 days after (first reinstatement)
    const postCancellation14 = addDays(dueDate, 14); // 14 days after (second reinstatement)
    
    // Only add follow-ups that are still in the future or recent past
    // Skip any reminders more than 1 day in the past (they're irrelevant now)
    
    // Pre-reminder (if not too far in the past)
    if (preReminderDate >= addDays(now, -1)) {
      followUps.push({
        date: preReminderDate.toISOString(),
        type: 'pre-reminder',
        description: 'Upcoming payment reminder',
        status: preReminderDate < now ? 'skipped' : 'pending',
        method: 'sms',
      });
    }
    
    // Due date reminder
    if (dueDateReminder >= addDays(now, -1)) {
      followUps.push({
        date: dueDateReminder.toISOString(),
        type: 'due-date',
        description: 'Payment due today (autopay declined)',
        status: dueDateReminder < now ? 'skipped' : 'pending',
        method: 'phone',
      });
    }
    
    // Overdue reminders - these are typically still relevant
    if (overdueDay5 < expirationDate) {
      followUps.push({
        date: overdueDay5.toISOString(),
        type: 'overdue',
        description: 'Still unpaid - follow up',
        status: overdueDay5 < now ? 'pending' : 'pending', // Even if in past, might still need to follow up
        method: 'sms',
      });
    }
    
    if (overdueDay7 < expirationDate) {
      followUps.push({
        date: overdueDay7.toISOString(),
        type: 'overdue',
        description: 'Second follow-up',
        status: 'pending',
        method: 'sms',
      });
    }
    
    if (finalDay9 < expirationDate) {
      followUps.push({
        date: finalDay9.toISOString(),
        type: 'final',
        description: 'Final reminder (last day)',
        status: 'pending',
        method: 'phone',
      });
    }
    
    // Post-cancellation reminders (reinstatement opportunities)
    if (postCancellation12 < expirationDate) {
      followUps.push({
        date: postCancellation12.toISOString(),
        type: 'post-cancellation',
        description: 'First reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      });
    }
    
    if (postCancellation14 < expirationDate) {
      followUps.push({
        date: postCancellation14.toISOString(),
        type: 'post-cancellation',
        description: 'Second reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      });
    }

    // Update the customer to regular payment type with new follow-ups
    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          paymentType: 'regular',
          followUps: followUps,
          updatedAt: new Date(),
          autopayDeclinedDate: dueDate, // Track when autopay was declined
        },
      }
    );

    return NextResponse.json({ 
      success: true,
      message: 'Successfully changed to direct bill',
      dueDateReference: dueDate.toISOString(),
      followUpsCreated: followUps.length
    });
  } catch (error) {
    console.error('Error changing to direct bill:', error);
    return NextResponse.json(
      { 
        error: 'Failed to change to direct bill',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}