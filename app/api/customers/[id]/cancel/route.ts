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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const { cancellationReason, customWinBackDate } = await request.json();

    const cancellationDate = new Date();
    let winBackDate: Date | undefined;
    const followUps: FollowUp[] = []; // Use FollowUp type instead of any[]

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
      followUps.push({
        date: winBackDate.toISOString(),
        type: "win-back",
        description: "Win-back attempt (custom follow-up date)",
        status: "pending",
        method: "phone",
      });
    }

    await db.collection('payment_reminder_coll').updateOne(
      { id: params.id },
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling customer:', error);
    return NextResponse.json({ error: 'Failed to cancel customer' }, { status: 500 });
  }
}