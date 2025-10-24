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

    if (customer.paymentType === 'autopay') {
      return NextResponse.json(
        { error: 'Customer is already on autopay' },
        { status: 400 }
      );
    }

    const currentDueDate = customer.dueDate 
      ? new Date(customer.dueDate)
      : new Date();
    
    const expirationDate = new Date(customer.expirationDate);
    const totalPayments = customer.totalPayments || 6;
    
    // Generate autopay follow-ups
    const followUps: FollowUp[] = [];
    
    // Next payment cycle with autopay schedule
    const nextDueDate = new Date(currentDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    if (nextDueDate < expirationDate) {
      followUps.push(
        {
          date: addDays(nextDueDate, -3).toISOString(),
          type: 'pre-check',
          description: 'Check autopay schedule',
          status: 'pending',
          method: 'sms',
        },
        {
          date: nextDueDate.toISOString(),
          type: 'due-date',
          description: 'Confirm autopay succeeded',
          status: 'pending',
          method: 'sms',
        },
        {
          date: addDays(nextDueDate, 7).toISOString(),
          type: 'verification',
          description: 'Verify payment posted correctly',
          status: 'pending',
          method: 'email',
        }
      );
    }

    // Add renewal reminders
    const lastDay = addDays(expirationDate, -1);

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

    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          paymentType: 'autopay',
          followUps: followUps,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error changing to autopay:', error);
    return NextResponse.json(
      { 
        error: 'Failed to change to autopay',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}