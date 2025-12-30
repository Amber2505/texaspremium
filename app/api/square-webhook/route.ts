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
    const payment = event.data?.object?.payment;

    // 1. Log to see which event is hitting you (Check your Vercel/server logs)
    console.log(`WEBHOOK: Event ${event.type} | Payment Status: ${payment?.status}`);

    // 2. ONLY act if it's the 'payment.updated' AND 'COMPLETED' status
    if (event.type === 'payment.updated' && payment?.status === 'COMPLETED') {
      
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || "Guest";

      const card = payment.card_details?.card;
      const methodStr = `${card?.card_brand || "CARD"} **** ${card?.last_4 || ""} (Exp: ${card?.exp_month}/${card?.exp_year})`;

      // 3. FIRE AND FORGET (No 'await')
      // This sends the email in the background so we can respond to Square immediately
      sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: methodStr,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      }).catch(err => console.error("Email error:", err));

      // 4. Respond to Square within milliseconds
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Always respond 200 to events we aren't using so Square stops retrying them
    return NextResponse.json({ ignored: true }, { status: 200 });
    
  } catch (error) {
    console.error('Webhook Error:', error);
    // Even on error, return 200 to Square to stop the email loop during testing
    return NextResponse.json({ error: 'Internal Error' }, { status: 200 });
  }
}