import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function GET() {
  try {
    await sendPaymentNotification({
      amount: '$150.00',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      transactionId: 'test_12345',
      timestamp: new Date(),
    });
    return NextResponse.json({ success: true, message: 'Test email sent!' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}