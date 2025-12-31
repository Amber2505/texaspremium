import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    const notificationUrl = process.env.SQUARE_NOTIFICATION_URL || 'https://www.texaspremiumins.com/api/square-webhook';
    const isValid = WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
      notificationUrl: notificationUrl,
    });

    if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;

    // --- THE FIX: STRICT FILTERING ---
    // Only proceed if the event is 'payment.updated' AND the status is 'COMPLETED'
    // This ignores 'APPROVED' and 'CAPTURED' events which were causing the extra emails.
    if (event.type === 'payment.updated' && payment?.status === 'COMPLETED') {
      
      console.log(`🎯 TARGET REACHED: Payment ${payment.id} is COMPLETED. Sending 1 email.`);

      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;
      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || "Guest";

      // Send the email (Using Resend or Gmail)
      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: `${payment.card_details?.card?.card_brand} **** ${payment.card_details?.card?.last_4}`,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // If it's not COMPLETED (e.g., APPROVED), we just log it and say "thanks" to Square
    console.log(`ℹ️ Skipping event ${event.type} with status ${payment?.status}`);
    return NextResponse.json({ ignored: true }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Webhook Error:', error.message);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}