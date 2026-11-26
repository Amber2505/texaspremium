// app/api/square-webhook/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
import { getDatabase } from '@/lib/mongodb';
import { notifyAdmin } from '@/lib/notifyAdmin';

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
    const orderId = payment?.order_id; // Capture this for frontend lookup

    // --- 1. FILTERS (Refunds & Office Payments) ---
    const isRefund = (payment?.refund_ids && payment.refund_ids.length > 0) || (payment?.refunded_money?.amount > 0);
    const isOfficePayment = payment?.device_details || payment?.card_details?.device_details;
    const isCompleted = event.type === 'payment.updated' && payment?.status === 'COMPLETED';

    if (isRefund || isOfficePayment || !isCompleted || !paymentId) {
      console.log(`⏭️ Webhook ignored: refund=${isRefund}, office=${isOfficePayment}, completed=${isCompleted}, hasId=${!!paymentId}`);
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

    // Get metadata from payment note (stored when creating payment link)
    let language = "en";
    let redirectMethod = "card";
    let storedPhone = customerPhone.replace(/\D/g, '');
    
    try {
      if (payment.note) {
        const metadata = JSON.parse(payment.note);
        language = metadata.language || "en";
        redirectMethod = metadata.paymentMethod || "card";
        storedPhone = metadata.customerPhone || storedPhone;
      }
    } catch (e) {
      console.log("⚠️ Could not parse payment note metadata");
    }

    console.log(`📝 Payment Data Extracted:`, {
      paymentId,
      amount: amountDollars,
      email: customerEmail,
      phone: storedPhone,
      cardLast4
    });

    // --- 4. STORE PAYMENT DATA IN MONGODB FOR CONSENT PAGE ---
    const paymentsCollection = db.collection("completed_payments");
    
    console.log(`💾 Attempting to store in completed_payments...`);
    
    // Create TTL index if it doesn't exist
    try {
      await paymentsCollection.createIndex(
        { "expireAt": 1 },
        { expireAfterSeconds: 0 }
      );
    } catch (indexError: any) {
      console.log(`⚠️ Index creation warning:`, indexError.message);
    }

    const paymentDocument = {
      _id: paymentId as any,
      orderId: orderId,
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
    };

    console.log(`💾 Inserting document:`, paymentDocument);

    try {
      const insertResult = await paymentsCollection.insertOne(paymentDocument);
      console.log(`✅ Payment data stored in MongoDB completed_payments:`, insertResult.insertedId);
    } catch (storeError: any) {
      console.error(`❌ CRITICAL: Failed to store payment data in completed_payments:`, storeError);
      console.error(`Error code:`, storeError.code);
      console.error(`Error message:`, storeError.message);
      // ⚠️ This is critical - if we can't store the payment, the user will be stuck
      // Don't just continue - we need to know about this
      throw storeError;
    }

    // --- 4b. MARK THE PAYMENT LINK PAID ---
    // Square confirmed this payment, so the link it belongs to is paid even if the
    // customer closed the tab before coming back to /pay/{linkId}.
    // Same phone + same amount, not paid yet, created in the last 3 days.
    try {
      const last10 = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
      const links = db.collection('payment_link_generated');
      const candidates = await links
        .find({
          amount: amountCents,
          'completedStages.payment': { $ne: true },
          createdAtTimestamp: { $gte: Date.now() - 3 * 24 * 60 * 60 * 1000 },
        })
        .sort({ createdAtTimestamp: -1 })
        .limit(20)
        .toArray();
      const phone = last10(storedPhone);
      const hit = phone ? candidates.find((l: any) => last10(l.customerPhone) === phone) : null;
      if (hit) {
        const nowIso = new Date().toISOString();
        const res = await links.updateOne(
          { _id: hit._id, 'completedStages.payment': { $ne: true } },
          {
            $set: {
              'completedStages.payment': true,
              'timestamps.payment': nowIso,
              lastUpdated: nowIso,
              currentStage: 'payment',
              squarePaymentId: paymentId,
              paidVia: 'webhook',
            },
          },
        );
        if (res.modifiedCount) {
          console.log(`🔗 Link ${hit._id} marked paid from webhook (${paymentId})`);
          const linkId = hit.publicLinkId || String(hit._id);
          await notifyAdmin({
            section: 'payment-links',
            title: 'Payment completed',
            body: `${hit.customerPhone || ''} — $${amountDollars}`,
            eventId: `payment-${linkId}`,
          }).catch(() => {});
          fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL}/notify/payment-progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkId }),
          }).catch(() => {});
        }
      }
    } catch (linkErr: any) {
      console.error('⚠️ Could not mark payment link paid:', linkErr.message);
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
      // Email failed but payment is stored - that's ok, don't remove lock
      return NextResponse.json({ success: true, emailFailed: true }, { status: 200 });
    }

  } catch (error: any) {
    console.error('❌ Webhook System Error:', error.message);
    console.error('Stack:', error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}