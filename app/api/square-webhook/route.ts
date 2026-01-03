import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';

/* eslint-disable @typescript-eslint/no-explicit-any */

// This stays in memory on Railway to block rapid-fire duplicates
const processedPayments = new Set<string>();

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    // 1. Verify Square Signature
    const notificationUrl = process.env.SQUARE_NOTIFICATION_URL || 'https://www.texaspremiumins.com/api/square-webhook';
    const isValid = WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
      notificationUrl: notificationUrl,
    });

    if (!isValid) {
      console.error('❌ Square Webhook: Invalid Signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;
    const paymentId = payment?.id;

    // --- 1. THE REFUND GATE ---
    const isRefund = (payment?.refund_ids && payment.refund_ids.length > 0) || (payment?.refunded_money?.amount > 0);
    if (isRefund) {
      console.log(`⏭️ REFUND DETECTED: Skipping email for Payment ${paymentId}`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // --- 2. THE OFFICE/DEVICE GATE ---
    const isOfficePayment = payment?.device_details || payment?.card_details?.device_details;
    if (isOfficePayment) {
      console.log(`🏢 OFFICE PAYMENT DETECTED: Skipping email for Payment ${paymentId}`);
      return NextResponse.json({ success: true, message: 'Office payment ignored' }, { status: 200 });
    }

    // --- 3. THE COMPLETION & DUPLICATE GATE ---
    const isCompleted = event.type === 'payment.updated' && payment?.status === 'COMPLETED';

    if (isCompleted && paymentId) {
      // CHECK IMMEDIATELY: If we are already processing this ID, kill the second request
      if (processedPayments.has(paymentId)) {
        console.log(`♻️ DUPLICATE BLOCKED: ${paymentId}`);
        return NextResponse.json({ success: true }, { status: 200 });
      }

      // LOCK IMMEDIATELY: Add to set before any 'await' happens
      processedPayments.add(paymentId);
      
      // Safety: Remove from memory after 30 minutes
      setTimeout(() => processedPayments.delete(paymentId), 30 * 60 * 1000);

      console.log(`🎯 TARGET REACHED: Online Payment ${paymentId}. Sending 1 email.`);

      // Prepare Data
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;
      
      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || 
                           "Online Customer";

      try {
        // Send Email
        await sendPaymentNotification({
          amount: amountStr,
          customerName,
          customerEmail: payment.buyer_email_address || "Check Dashboard",
          method: `${payment.card_details?.card?.card_brand || "CARD"} **** ${payment.card_details?.card?.last_4 || ""}`,
          transactionId: paymentId,
          timestamp: new Date(),
          paymentJson: JSON.stringify(event, null, 2),
        });
      } catch (emailError: any) {
        console.error(`❌ Email Failed for ${paymentId}:`, emailError.message);
        // If email fails, remove from lock so Square can retry the webhook
        processedPayments.delete(paymentId);
        return NextResponse.json({ error: 'Email failed' }, { status: 500 });
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Default response for other event types (payment.created, etc)
    return NextResponse.json({ ignored: true }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Webhook System Error:', error.message);
    // Always return 200 to Square in catch block to stop them from retrying on a crash
    return NextResponse.json({ success: true }, { status: 200 });
  }
}