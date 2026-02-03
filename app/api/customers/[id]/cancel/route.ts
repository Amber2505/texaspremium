// app/api/customers/[id]/cancel/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      cancellationReason, 
      cancellationDate,
      customWinBackDate 
    } = body;

    if (!cancellationDate) {
      return NextResponse.json(
        { error: 'Cancellation date is required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('db');

    const customer = await db
      .collection('payment_reminder_coll')
      .findOne({ id });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Parse the cancellation date
    const cancelDate = new Date(cancellationDate);
    cancelDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues

    // Generate win-back follow-ups based on cancellation reason
    const followUps: FollowUp[] = [];
    let winBackDate: Date | null = null;

    switch (cancellationReason) {
      case 'non-payment':
        // Follow up 3 months after cancellation date
        winBackDate = addMonths(cancelDate, 3);
        followUps.push({
          date: winBackDate.toISOString(),
          type: 'win-back',
          description: 'Win-back opportunity - 3 months after cancellation',
          status: 'pending',
          method: 'phone',
        });
        
        // Also add 6 month follow-up
        const sixMonthDate = addMonths(cancelDate, 6);
        followUps.push({
          date: sixMonthDate.toISOString(),
          type: 'win-back',
          description: 'Win-back opportunity - 6 months after cancellation',
          status: 'pending',
          method: 'phone',
        });
        break;

      case 'customer-choice':
        // Follow up 15 days before 6 months (at 5.5 months)
        winBackDate = addDays(addMonths(cancelDate, 6), -15);
        followUps.push({
          date: winBackDate.toISOString(),
          type: 'win-back',
          description: 'Win-back opportunity - 15 days before 6 months',
          status: 'pending',
          method: 'phone',
        });
        
        // Also add the 6 month mark
        const sixMonthMark = addMonths(cancelDate, 6);
        followUps.push({
          date: sixMonthMark.toISOString(),
          type: 'win-back',
          description: 'Win-back opportunity - 6 months after cancellation',
          status: 'pending',
          method: 'phone',
        });
        break;

      case 'custom-date':
        if (!customWinBackDate) {
          return NextResponse.json(
            { error: 'Custom win-back date is required' },
            { status: 400 }
          );
        }
        winBackDate = new Date(customWinBackDate);
        winBackDate.setHours(12, 0, 0, 0);
        followUps.push({
          date: winBackDate.toISOString(),
          type: 'win-back',
          description: 'Win-back opportunity - custom date',
          status: 'pending',
          method: 'phone',
        });
        break;

      case 'no-followup':
        // No follow-ups needed
        winBackDate = null;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid cancellation reason' },
          { status: 400 }
        );
    }

    // Update the customer
    const updateData: Record<string, unknown> = {
      status: 'cancelled',
      cancellationDate: cancelDate,
      cancellationReason,
      followUps,
      updatedAt: new Date(),
    };

    if (winBackDate) {
      updateData.winBackDate = winBackDate;
    }

    await db.collection('payment_reminder_coll').updateOne(
      { id },
      { $set: updateData }
    );

    return NextResponse.json({ 
      success: true,
      message: 'Customer cancelled successfully',
      cancellationDate: cancelDate.toISOString(),
      winBackDate: winBackDate?.toISOString() || null,
      followUpsCreated: followUps.length
    });
  } catch (error) {
    console.error('Error cancelling customer:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cancel customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}