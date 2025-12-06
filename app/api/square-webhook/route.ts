import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    // Verify webhook signature (optional but recommended for security)
    // const webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    // const hash = crypto.createHmac('sha256', webhookSignatureKey).update(body).digest('base64');
    // if (hash !== signature) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }

    const event = JSON.parse(body);
    
    // Check if this is a payment completed event
    if (event.type === 'payment.created' || event.type === 'payment.updated') {
      const payment = event.data.object.payment;
      
      // Send notification email
      await sendPaymentNotification({
        amount: `$${(payment.total_money.amount / 100).toFixed(2)}`,
        customerName: payment.buyer_email_address || 'Customer',
        customerEmail: payment.buyer_email_address,
        transactionId: payment.id,
        timestamp: new Date(payment.created_at),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}