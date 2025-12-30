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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;

    // CRITICAL: Only proceed if the payment is COMPLETED. 
    // This prevents 5 emails as the payment moves through "Approved", "Captured", etc.
    if (payment && payment.status === 'COMPLETED') {
      
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      // 1. Better Name Extraction (Billing -> Shipping -> Cardholder -> Note)
      const firstName = payment.billing_address?.first_name || payment.shipping_address?.first_name || "";
      const lastName = payment.billing_address?.last_name || payment.shipping_address?.last_name || "";
      
      let customerName = `${firstName} ${lastName}`.trim();
      
      if (!customerName) {
        customerName = payment.card_details?.cardholder_name || payment.note || "Guest Customer";
      }

      // 2. Enhanced Card Details (Brand + Last 4 + Expiry)
      const card = payment.card_details?.card;
      const cardBrand = card?.card_brand || "CARD";
      const last4 = card?.last_4 ? `**** ${card.last_4}` : "";
      const expiry = card?.exp_month ? ` (Exp: ${card.exp_month}/${card.exp_year})` : "";
      const methodStr = `${cardBrand} ${last4}${expiry}`;

      await sendPaymentNotification({
        amount: amountStr,
        customerName: customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: methodStr,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      // Return 200 immediately so Square stops retrying
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // For other statuses (like APPROVED), we just say "thanks" but don't send an email
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}