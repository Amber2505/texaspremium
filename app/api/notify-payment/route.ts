import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    await sendPaymentNotification({
      amount: body.amount,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      transactionId: body.transactionId,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}