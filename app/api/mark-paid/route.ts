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

    const currentDueDate = new Date(customer.dueDate);
    const expirationDate = new Date(customer.expirationDate);
    const paymentType = customer.paymentType || 'regular';
    
    // Calculate next due date (same day next month)
    const nextDueDate = addMonths(currentDueDate, 1);
    
    // Calculate remaining payments
    const newRemainingPayments = Math.max(0, (customer.remainingPayments || 1) - 1);
    
    // Mark current month's follow-ups as completed
    const updatedFollowUps = customer.followUps.map((followUp: FollowUp) => {
      const followUpDate = new Date(followUp.date);
      // If follow-up is for current month and not a renewal, mark as completed
      if (
        followUpDate.getMonth() === currentDueDate.getMonth() &&
        followUpDate.getFullYear() === currentDueDate.getFullYear() &&
        followUp.type !== 'renewal'
      ) {
        return { ...followUp, status: 'completed' };
      }
      return followUp;
    });

    // Check if there are more payments due before expiration
    if (nextDueDate < expirationDate && newRemainingPayments > 0) {
      // Generate next month's reminders based on payment type
      const newFollowUps: FollowUp[] = [];

      if (paymentType === 'regular') {
        newFollowUps.push(
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
          },
          {
            date: addDays(nextDueDate, 12).toISOString(),
            type: 'post-cancellation',
            description: 'First reinstatement opportunity',
            status: 'pending',
            method: 'phone',
          },
          {
            date: addDays(nextDueDate, 14).toISOString(),
            type: 'post-cancellation',
            description: 'Second reinstatement opportunity',
            status: 'pending',
            method: 'phone',
          }
        );
      } else if (paymentType === 'autopay') {
        newFollowUps.push(
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

      // Add new follow-ups to the existing ones (keep renewal reminders)
      updatedFollowUps.push(...newFollowUps);

      // Sort all follow-ups by date
      updatedFollowUps.sort((a: FollowUp, b: FollowUp) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    // Update the customer record
    await db.collection('payment_reminder_coll').updateOne(
      { id: customerId },
      {
        $set: {
          dueDate: nextDueDate.toISOString(),
          remainingPayments: newRemainingPayments,
          followUps: updatedFollowUps,
          lastPaymentDate: new Date().toISOString(),
          last_updated: new Date(),
        },
      }
    );

    return NextResponse.json({ 
      success: true,
      nextDueDate: nextDueDate.toISOString(),
      remainingPayments: newRemainingPayments,
      message: newRemainingPayments > 0 
        ? `Payment marked as paid. Next payment due: ${nextDueDate.toLocaleDateString()}`
        : 'Payment marked as paid. All payments completed!'
    });
  } catch (error) {
    console.error('Error marking payment as paid:', error);
    return NextResponse.json(
      { 
        error: 'Failed to mark payment as paid',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}