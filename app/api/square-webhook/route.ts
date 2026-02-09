// app/api/square-webhook/route.ts
import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
import { getDatabase } from '@/lib/mongodb';

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
    const db = await getDatabase('db');
    const locks = db.collection("payment_verify_id");

    try {
      // Ensure TTL Index exists
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

    // --- 3. EXTRACT ALL DATA FROM SQUARE PAYMENT OBJECT ---
    const money = payment.amount_money || payment.total_money;
    const amountCents = Number(money.amount);
    const amountDollars = (amountCents / 100).toFixed(2);
    const amountStr = `$${amountDollars} ${money.currency}`;
    
    // Extract card details
    const cardBrand = payment.card_details?.card?.card_brand || "CARD";
    const cardLast4 = payment.card_details?.card?.last_4 || "";
    const paymentMethod = `${cardBrand} **** ${cardLast4}`;
    
    // Extract customer info from Square payment object
    const billing = payment.billing_address;
    const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                         payment.card_details?.cardholder_name || 
                         "Online Customer";
    
    const customerEmail = payment.buyer_email_address || "";
    const customerPhone = billing?.phone_number || "";

    // Get metadata from payment (stored when creating payment link)
    const metadata = payment.reference_id ? JSON.parse(payment.reference_id || '{}') : {};
    const language = metadata.language || "en";
    const redirectMethod = metadata.paymentMethod || "card";
    const storedPhone = metadata.customerPhone || customerPhone.replace(/\D/g, '');

    // --- 4. STORE PAYMENT DATA IN MONGODB FOR CONSENT PAGE ---
    try {
      const paymentsCollection = db.collection("completed_payments");
      
      // Create TTL index if it doesn't exist
      await paymentsCollection.createIndex(
        { "expireAt": 1 },
        { expireAfterSeconds: 0 }
      );

      await paymentsCollection.insertOne({
        _id: paymentId as any,
        amount: parseFloat(amountDollars),
        amountCents: amountCents,
        currency: money.currency || "USD",
        cardBrand,
        cardLast4,
        customerName,
        customerEmail,
        customerPhone: storedPhone,
        paymentMethod: paymentMethod,
        language,
        redirectMethod,
        transactionId: paymentId,
        processedAt: new Date(),
        webhookReceived: true,
        consentSigned: false,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // TTL: 24 hours
      });

      console.log(`✅ Payment data stored in MongoDB: ${paymentId}`);
    } catch (storeError: any) {
      console.error(`❌ Failed to store payment data: ${storeError.message}`);
      // Continue - don't fail webhook for storage issues
    }

    // --- 5. SEND INTERNAL NOTIFICATION EMAIL ---
    try {
      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: customerEmail || "Check Dashboard",
        method: paymentMethod,
        transactionId: paymentId,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });

      console.log(`✅ EMAIL SENT: Payment ${paymentId}`);
      return NextResponse.json({ success: true }, { status: 200 });

    } catch (emailError: any) {
      console.error(`❌ Email Failed for ${paymentId}:`, emailError.message);
      // Remove lock on failure so Square can retry
      await locks.deleteOne({ _id: paymentId as any });
      return NextResponse.json({ error: 'Email failed' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Webhook System Error:', error.message);
    return NextResponse.json({ success: true, error: error.message }, { status: 200 });
  }
}