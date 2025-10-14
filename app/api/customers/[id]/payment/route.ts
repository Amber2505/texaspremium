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

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function generateFollowUps(
  dueDate: Date,
  paymentType: string,
  expirationDate: Date,
  totalPayments: number
): FollowUp[] {
  const followUps: FollowUp[] = [];

  const addDaysInner = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Monthly payment follow-ups
  if (paymentType === 'regular') {
    followUps.push(
      {
        date: addDaysInner(dueDate, -2).toISOString(),
        type: 'pre-reminder',
        description: 'Upcoming payment reminder',
        status: 'pending',
        method: 'email',
      },
      {
        date: dueDate.toISOString(),
        type: 'due-date',
        description: 'Payment due today',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDaysInner(dueDate, 5).toISOString(),
        type: 'overdue',
        description: 'Still unpaid - follow up',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDaysInner(dueDate, 7).toISOString(),
        type: 'overdue',
        description: 'Second follow-up',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDaysInner(dueDate, 9).toISOString(),
        type: 'final',
        description: 'Final reminder (last day)',
        status: 'pending',
        method: 'phone',
      }
    );
  } else if (paymentType === 'autopay') {
    followUps.push(
      {
        date: addDaysInner(dueDate, -2).toISOString(),
        type: 'pre-check',
        description: 'Check autopay schedule',
        status: 'pending',
        method: 'email',
      },
      {
        date: dueDate.toISOString(),
        type: 'due-date',
        description: 'Confirm autopay succeeded',
        status: 'pending',
        method: 'email',
      },
      {
        date: addDaysInner(dueDate, 7).toISOString(),
        type: 'verification',
        description: 'Verify payment posted correctly',
        status: 'pending',
        method: 'email',
      }
    );
  }

  // RENEWAL REMINDERS - Add for all payment types
  const lastDay = addDaysInner(expirationDate, -1);

  if (totalPayments >= 6) {
    // 6-month or 12-month policy
    followUps.push(
      {
        date: addDaysInner(expirationDate, -15).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 15 days before expiration',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDaysInner(expirationDate, -3).toISOString(),
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
    // Month-to-month policy
    followUps.push(
      {
        date: addDaysInner(expirationDate, -5).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 5 days before expiration',
        status: 'pending',
        method: 'email',
      },
      {
        date: addDaysInner(expirationDate, -2).toISOString(),
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

  return followUps;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const customerId = params.id;

    const customer = await db
      .collection('payment_reminder_coll')
      .findOne({ id: customerId });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const remainingPayments = customer.remainingPayments - 1;
    const currentDueDate = new Date(customer.dueDate);

    let newStatus = 'active';
    let newDueDate: Date;

    if (remainingPayments === 0) {
      newStatus = 'paid';
      newDueDate = currentDueDate;
    } else {
      // Calculate next due date based on payment day of month
      newDueDate = addMonths(currentDueDate, 1);
      newDueDate.setDate(customer.paymentDayOfMonth);

      // Check if the new due date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      newDueDate.setHours(0, 0, 0, 0);

      if (newDueDate < today) {
        newStatus = 'overdue';
      }
    }

    const newFollowUps =
      remainingPayments > 0
        ? generateFollowUps(
            newDueDate,
            customer.paymentType,
            new Date(customer.expirationDate),
            customer.totalPayments
          )
        : [];

    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          remainingPayments,
          dueDate: newDueDate.toISOString(),
          status: newStatus,
          followUps: newFollowUps,
          lastContact: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking payment:', error);
    return NextResponse.json(
      { error: 'Failed to mark payment' },
      { status: 500 }
    );
  }
}