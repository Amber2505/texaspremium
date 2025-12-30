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

    if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const event = JSON.parse(body);
    
    // GUARD 1: Only trigger on payment updates (this avoids the 'created' duplicate)
    if (event.type !== 'payment.updated') {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    const payment = event.data?.object?.payment;

    // GUARD 2: Only proceed if status is COMPLETED
    if (payment && payment.status === 'COMPLETED') {
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      // Name Extraction (Using Amber's data structure)
      const billing = payment.billing_address;
      const shipping = payment.shipping_address;
      const firstName = billing?.first_name || shipping?.first_name || "";
      const lastName = billing?.last_name || shipping?.last_name || "";
      
      let customerName = `${firstName} ${lastName}`.trim();
      if (!customerName) {
        customerName = payment.card_details?.cardholder_name || payment.note || "Guest Customer";
      }

      // Card details formatting
      const card = payment.card_details?.card;
      const methodStr = `${card?.card_brand || "CARD"} **** ${card?.last_4 || ""} (Exp: ${card?.exp_month}/${card?.exp_year})`;

      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: methodStr,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}