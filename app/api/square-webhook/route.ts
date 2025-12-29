import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    const isValid = WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
      notificationUrl: process.env.SQUARE_NOTIFICATION_URL!,
    });

    if (!isValid) {
      console.error('❌ Invalid Square Signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;

    if (payment && payment.status === 'COMPLETED') {
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      await sendPaymentNotification({
        amount: amountStr,
        customerName: payment.note || payment.buyer_email_address || 'Square Customer',
        customerEmail: payment.buyer_email_address || 'Check Dashboard',
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) { // Change 'any' to 'unknown'
    const message = error instanceof Error ? error.message : "Unknown Webhook Error";
    console.error('Webhook error:', message);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}