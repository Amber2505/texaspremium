import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
/* eslint-disable @typescript-eslint/no-explicit-any */

// 1. Create a simple "Already Processed" set outside the handler
// This persists as long as the Vercel "warm" instance is alive.
const processedPayments = new Set<string>();

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
    
    // We use the event_id or payment.id + status to create a unique fingerprint
    const paymentId = payment?.id;
    const isCompleted = event.type === 'payment.updated' && payment?.status === 'COMPLETED';

    if (isCompleted && paymentId) {
      // 2. CHECK THE CACHE
      if (processedPayments.has(paymentId)) {
        console.log(`♻️ DUPLICATE BLOCKED: Already sent email for ${paymentId}`);
        return NextResponse.json({ success: true, message: 'Already processed' }, { status: 200 });
      }

      // 3. ADD TO CACHE IMMEDIATELY (Before sending the email)
      processedPayments.add(paymentId);
      
      // Optional: Cleanup old IDs after 5 minutes to keep memory low
      setTimeout(() => processedPayments.delete(paymentId), 5 * 60 * 1000);

      console.log(`🎯 TARGET REACHED: Payment ${paymentId} is COMPLETED. Sending 1 email.`);

      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;
      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || "Guest";

      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: `${payment.card_details?.card?.card_brand} **** ${payment.card_details?.card?.last_4}`,
        transactionId: paymentId,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ ignored: true }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Webhook Error:', error.message);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}