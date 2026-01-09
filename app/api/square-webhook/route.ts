import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
import { getDatabase } from '@/lib/mongodb'; // Using your helper

/* eslint-disable @typescript-eslint/no-explicit-any */

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

    // --- 1. FILTERS (Refunds & Office Payments) ---
    const isRefund = (payment?.refund_ids && payment.refund_ids.length > 0) || (payment?.refunded_money?.amount > 0);
    const isOfficePayment = payment?.device_details || payment?.card_details?.device_details;
    const isCompleted = event.type === 'payment.updated' && payment?.status === 'COMPLETED';

    if (isRefund || isOfficePayment || !isCompleted || !paymentId) {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }

    // --- 2. THE MONGODB PERSISTENT LOCK ---
    const db = await getDatabase('db'); // Uses your helper from lib/mongodb.ts
    const locks = db.collection("payment_verify_id");

    try {
      // Ensure TTL Index exists (Runs only once if it doesn't exist)
      // This tells Mongo to delete documents 24 hours (86400 seconds) after 'processedAt'
      await locks.createIndex({ "processedAt": 1 }, { expireAfterSeconds: 86400 });

      // Attempt the Lock
      await locks.insertOne({
        _id: paymentId as any,
        processedAt: new Date(),
        customerEmail: payment.buyer_email_address || "N/A"
      });
      
      console.log(`🎯 DB LOCK ACQUIRED: Processing Payment ${paymentId}`);
    } catch (dbError: any) {
      if (dbError.code === 11000) {
        console.log(`♻️ DB BLOCKED DUPLICATE: ${paymentId}`);
        return NextResponse.json({ success: true, message: 'Duplicate blocked by DB' }, { status: 200 });
      }
      throw dbError;
    }

    // --- 3. PREPARE DATA ---
    const money = payment.amount_money || payment.total_money;
    const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;
    const billing = payment.billing_address;
    const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                         payment.card_details?.cardholder_name || 
                         "Online Customer";

    // --- 4. SEND EMAIL ---
    try {
      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Dashboard",
        method: `${payment.card_details?.card?.card_brand || "CARD"} **** ${payment.card_details?.card?.last_4 || ""}`,
        transactionId: paymentId,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      console.log(`✅ EMAIL SENT: Payment ${paymentId}`);
      return NextResponse.json({ success: true }, { status: 200 });

    } catch (emailError: any) {
      console.error(`❌ Email Failed for ${paymentId}:`, emailError.message);
      // Remove lock on failure so Square can retry and we can try the email again
      await locks.deleteOne({ _id: paymentId as any });
      return NextResponse.json({ error: 'Email failed' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Webhook System Error:', error.message);
    return NextResponse.json({ success: true, error: error.message }, { status: 200 });
  }
}