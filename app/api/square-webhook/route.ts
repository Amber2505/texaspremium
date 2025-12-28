import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const event = JSON.parse(body);
    
    // Extract payment info correctly (for payment.created event)
    const payment = event.data?.object || {};
    
    // Use amount_money or total_money as preferred; here using total_money if available, else amount_money
    let amount = 'See JSON below';
    if (payment.total_money?.amount) {
      amount = `$${(payment.total_money.amount / 100).toFixed(2)} ${payment.total_money.currency || 'USD'}`;
    } else if (payment.amount_money?.amount) {
      amount = `$${(payment.amount_money.amount / 100).toFixed(2)} ${payment.amount_money.currency || 'USD'}`;
    }
    
    // Send notification email with full JSON
    await sendPaymentNotification({
      amount: amount,
      customerName: payment.note || payment.buyer_email_address || 'See JSON below',  // Improved fallback; note might have name info
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