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

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
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

    const now = new Date();
    const originalDueDate = customer.dueDate 
      ? new Date(customer.dueDate)
      : new Date();
    
    const expirationDate = new Date(customer.expirationDate);
    const totalPayments = customer.totalPayments || 6;
    const paymentDayOfMonth = customer.paymentDayOfMonth || originalDueDate.getDate();
    
    // Generate autopay follow-ups
    const followUps: FollowUp[] = [];
    
    // Calculate the NEXT due date for autopay
    // This should be the next occurrence of the payment day that's in the future
    let nextDueDate = new Date(now);
    nextDueDate.setDate(paymentDayOfMonth);
    nextDueDate.setHours(0, 0, 0, 0);
    
    // If the payment day this month has already passed, move to next month
    if (nextDueDate <= now) {
      nextDueDate = addMonths(nextDueDate, 1);
    }
    
    // Generate autopay follow-ups for the next payment cycle
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
    
    // Continue adding autopay reminders for subsequent months until expiration
    let currentPaymentDate = addMonths(nextDueDate, 1);
    while (currentPaymentDate < expirationDate) {
      followUps.push(
        {
          date: addDays(currentPaymentDate, -3).toISOString(),
          type: 'pre-check',
          description: 'Check autopay schedule',
          status: 'pending',
          method: 'sms',
        },
        {
          date: currentPaymentDate.toISOString(),
          type: 'due-date',
          description: 'Confirm autopay succeeded',
          status: 'pending',
          method: 'sms',
        },
        {
          date: addDays(currentPaymentDate, 7).toISOString(),
          type: 'verification',
          description: 'Verify payment posted correctly',
          status: 'pending',
          method: 'email',
        }
      );
      
      currentPaymentDate = addMonths(currentPaymentDate, 1);
    }

    // Add renewal reminders based on policy length
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

    // Update customer to autopay with new follow-ups
    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          paymentType: 'autopay',
          followUps: followUps,
          dueDate: nextDueDate, // Update to the new upcoming due date
          updatedAt: new Date(),
        },
        $unset: {
          autopayDeclinedDate: "", // Remove the decline date since we're back on autopay
        }
      }
    );

    return NextResponse.json({ 
      success: true,
      message: 'Successfully changed to autopay',
      nextDueDate: nextDueDate.toISOString(),
      followUpsCreated: followUps.length
    });
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