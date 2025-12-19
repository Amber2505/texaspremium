import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const event = JSON.parse(body);
    
    // Try to extract payment info if available
    const payment = event.data?.object?.payment || {};
    const amount = payment.total_money?.amount 
      ? `$${(payment.total_money.amount / 100).toFixed(2)}`
      : 'See JSON below';
    
    // Send notification email with full JSON
    await sendPaymentNotification({
      amount: amount,
      customerName: payment.buyer_email_address || payment.note || 'See JSON below',
      customerEmail: payment.buyer_email_address || 'See JSON below',
      transactionId: payment.id || event.data?.id || 'See JSON below',
      timestamp: new Date(), // Date object as expected by email.ts
      paymentJson: JSON.stringify(event, null, 2), // Full JSON payload
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}