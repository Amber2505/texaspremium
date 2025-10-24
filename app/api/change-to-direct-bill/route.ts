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

    // Find the customer
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

    // Get current due date
    const currentDueDate = customer.dueDate 
      ? new Date(customer.dueDate)
      : new Date();
    
    const now = new Date();
    const expirationDate = new Date(customer.expirationDate);
    
    // Generate follow-ups starting from TODAY (no pre-reminder since card already declined)
    const followUps: FollowUp[] = [];
    
    // THIS MONTH - Start from today, no pre-reminder
    followUps.push(
      {
        date: now.toISOString(),
        type: 'due-date',
        description: 'Payment due - autopay declined, call for payment',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(now, 5).toISOString(),
        type: 'overdue',
        description: 'Still unpaid - follow up',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDays(now, 7).toISOString(),
        type: 'overdue',
        description: 'Second follow-up',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDays(now, 9).toISOString(),
        type: 'final',
        description: 'Final reminder (last day)',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(now, 12).toISOString(),
        type: 'post-cancellation',
        description: 'First reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(now, 14).toISOString(),
        type: 'post-cancellation',
        description: 'Second reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      }
    );

    // NEXT MONTH - Calculate next due date and add full cycle
    const nextDueDate = new Date(currentDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    // Only add next month reminders if policy hasn't expired
    if (nextDueDate < expirationDate) {
      followUps.push(
        {
          date: addDays(nextDueDate, -3).toISOString(),
          type: 'pre-reminder',
          description: 'Upcoming payment reminder',
          status: 'pending',
          method: 'sms',
        },
        {
          date: nextDueDate.toISOString(),
          type: 'due-date',
          description: 'Payment due today',
          status: 'pending',
          method: 'phone',
        },
        {
          date: addDays(nextDueDate, 5).toISOString(),
          type: 'overdue',
          description: 'Still unpaid - follow up',
          status: 'pending',
          method: 'sms',
        },
        {
          date: addDays(nextDueDate, 7).toISOString(),
          type: 'overdue',
          description: 'Second follow-up',
          status: 'pending',
          method: 'sms',
        },
        {
          date: addDays(nextDueDate, 9).toISOString(),
          type: 'final',
          description: 'Final reminder (last day)',
          status: 'pending',
          method: 'phone',
        }
      );
    }

    // Add renewal reminders
    const lastDay = addDays(expirationDate, -1);
    const totalPayments = customer.totalPayments || 6;

    if (totalPayments >= 6) {
      followUps.push(
        {
          date: addDays(expirationDate, -15).toISOString(),
          type: 'renewal',
          description: 'Renewal reminder - 15 days before expiration',
          status: 'pending',
          method: 'phone',
        },
        {
          date: addDays(expirationDate, -3).toISOString(),
          type: 'renewal',
          description: 'Renewal reminder - 3 days before expiration',
          status: 'pending',
          method: 'email',
        },
        {
          date: lastDay.toISOString(),
          type: 'renewal',
          description: 'URGENT: Policy expires tomorrow - Last day to renew',
          status: 'pending',
          method: 'phone',
        }
      );
    } else {
      followUps.push(
        {
          date: addDays(expirationDate, -5).toISOString(),
          type: 'renewal',
          description: 'Renewal reminder - 5 days before expiration',
          status: 'pending',
          method: 'email',
        },
        {
          date: addDays(expirationDate, -2).toISOString(),
          type: 'renewal',
          description: 'Renewal reminder - 2 days before expiration',
          status: 'pending',
          method: 'phone',
        },
        {
          date: lastDay.toISOString(),
          type: 'renewal',
          description: 'URGENT: Policy expires tomorrow - Last day to renew',
          status: 'pending',
          method: 'phone',
        }
      );
    }

    // Update customer to regular payment type with new follow-ups
    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          paymentType: 'regular',
          followUps: followUps,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true });
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