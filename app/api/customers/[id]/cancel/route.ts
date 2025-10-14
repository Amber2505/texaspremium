import { NextResponse, NextRequest } from 'next/server';
import clientPromise from '@/lib/mongodb';

type FollowUp = {
  date: string;
  type: string;
  description: string;
  status: string;
  method: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = await clientPromise;
    const db = client.db('db');
    const { cancellationReason, customWinBackDate } = await request.json();

    const validReasons = ["non-payment", "customer-choice", "custom-date", "no-followup"] as const;
    if (!validReasons.includes(cancellationReason)) {
      return NextResponse.json({ error: 'Invalid cancellation reason' }, { status: 400 });
    }

    const cancellationDate = new Date();
    let winBackDate: Date | undefined;
    const followUps: FollowUp[] = [];

    if (cancellationReason === "non-payment") {
      winBackDate = new Date();
      winBackDate.setMonth(winBackDate.getMonth() + 3);
      followUps.push({
        date: winBackDate.toISOString(),
        type: "win-back",
        description: "Win-back attempt (cancelled due to non-payment)",
        status: "pending",
        method: "phone",
      });
    } else if (cancellationReason === "customer-choice") {
      winBackDate = new Date();
      winBackDate.setMonth(winBackDate.getMonth() + 6);
      winBackDate.setDate(winBackDate.getDate() - 15);
      followUps.push({
        date: winBackDate.toISOString(),
        type: "win-back",
        description: "Win-back attempt (customer cancelled - offer better pricing)",
        status: "pending",
        method: "phone",
      });
    } else if (cancellationReason === "custom-date" && customWinBackDate) {
      winBackDate = new Date(customWinBackDate);
      if (isNaN(winBackDate.getTime())) {
        return NextResponse.json({ error: 'Invalid custom win-back date' }, { status: 400 });
      }
      followUps.push({
        date: winBackDate.toISOString(),
        type: "win-back",
        description: "Win-back attempt (custom follow-up date)",
        status: "pending",
        method: "phone",
      });
    }

    const result = await db.collection('payment_reminder_coll').updateOne(
      { id },
      {
        $set: {
          status: 'cancelled',
          cancellationDate: cancellationDate.toISOString(),
          cancellationReason,
          winBackDate: winBackDate?.toISOString(),
          followUps,
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling customer:', error);
    return NextResponse.json({ error: 'Failed to cancel customer' }, { status: 500 });
  }
}