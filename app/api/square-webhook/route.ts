import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
/* eslint-disable @typescript-eslint/no-explicit-any */

// 1. Create a "Memory Cache" to track IDs for 30 minutes.
// This handles Square's 6-minute fee updates and 80ms "race condition" retries.
const processedPayments = new Set<string>();

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    // Signature Verification
    const notificationUrl = process.env.SQUARE_NOTIFICATION_URL || 'https://www.texaspremiumins.com/api/square-webhook';
    const isValid = WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
      notificationUrl: notificationUrl,
    });

    if (!isValid) {
      console.error("❌ Square Webhook: Invalid Signature");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;
    const paymentId = payment?.id;

    // --- 2. THE REFUND GATE ---
    // If refund_ids exist OR refunded_money is present, skip the email.
    const hasRefundIds = payment?.refund_ids && payment.refund_ids.length > 0;
    const hasRefundAmount = payment?.refunded_money?.amount > 0;

    if (hasRefundIds || hasRefundAmount) {
      console.log(`⏭️ REFUND DETECTED: Skipping email for Payment ${paymentId}`);
      return NextResponse.json({ success: true, message: 'Refund ignored' }, { status: 200 });
    }

    // --- 3. THE COMPLETION & DUPLICATE GATE ---
    const isCompleted = event.type === 'payment.updated' && payment?.status === 'COMPLETED';

    if (isCompleted && paymentId) {
      
      // Check if we already handled this specific payment recently
      if (processedPayments.has(paymentId)) {
        console.log(`♻️ DUPLICATE BLOCKED: Already sent email for ${paymentId}`);
        return NextResponse.json({ success: true }, { status: 200 });
      }

      // Add to memory immediately before sending the email
      processedPayments.add(paymentId);
      
      // Cleanup ID after 30 minutes (covers Square's retry & fee update window)
      setTimeout(() => processedPayments.delete(paymentId), 30 * 60 * 1000);

      console.log(`🎯 TARGET REACHED: Payment ${paymentId} is COMPLETED. Sending 1 email.`);

      // Prepare data for email
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;
      
      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || 
                           "Guest Customer";

      // 4. Send Email Notification
      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: `${payment.card_details?.card?.card_brand || "CARD"} **** ${payment.card_details?.card?.last_4 || ""}`,
        transactionId: paymentId,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      console.log(`✅ Email sent successfully for ${paymentId}`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // If it's just a status like "APPROVED" or "AUTHORIZED", we ignore it
    return NextResponse.json({ ignored: true }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Webhook Error:', error.message);
    // We return 200 to Square to stop them from retrying a broken request repeatedly
    return NextResponse.json({ success: true }, { status: 200 });
  }
}