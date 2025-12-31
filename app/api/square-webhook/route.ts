import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    // Verify Signature
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

    if (event.type === 'payment.updated' && payment?.status === 'COMPLETED') {
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || "Guest";

      const card = payment.card_details?.card;
      const methodStr = `${card?.card_brand || "CARD"} **** ${card?.last_4 || ""}`;

      // --- THE FIX FOR GMAIL TIMEOUTS ---
      // We try to send the email, but if it takes more than 1.5 seconds, 
      // we stop waiting so we can tell Square "Success" before the timeout.
      console.log(`📧 Attempting email for ${payment.id}...`);
      
      const emailPromise = sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: methodStr,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email Timeout')), 1500)
      );

      try {
        await Promise.race([emailPromise, timeoutPromise]);
        console.log("✅ Email sent within Square's time limit.");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_err) {
        console.warn("⚠️ Email took too long or failed, but responding to Square to stop retries.");
      }
      // ----------------------------------

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ ignored: true }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Webhook Error:', error.message);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}