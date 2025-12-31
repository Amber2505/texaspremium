import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';

    // 1. Verify that this actually came from Square
    const isValid = WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
      notificationUrl: process.env.SQUARE_NOTIFICATION_URL!,
    });

    if (!isValid) {
      console.error("❌ Square Webhook: Invalid Signature");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const payment = event.data?.object?.payment;

    // 2. Log exactly what we are seeing
    console.log(`📩 Webhook Received | Event: ${event.type} | Status: ${payment?.status} | ID: ${payment?.id}`);

    // 3. ONLY proceed if the status is COMPLETED
    // This is the primary fix for the "3 emails" issue
    if (event.type === 'payment.updated' && payment?.status === 'COMPLETED') {
      
      const money = payment.amount_money || payment.total_money;
      const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

      // Extract Name (Billing -> Cardholder -> Note)
      const billing = payment.billing_address;
      const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                           payment.card_details?.cardholder_name || 
                           payment.note || 
                           "Guest Customer";

      // Extract Card Details
      const card = payment.card_details?.card;
      const methodStr = `${card?.card_brand || "CARD"} **** ${card?.last_4 || ""} (Exp: ${card?.exp_month}/${card?.exp_year})`;

      // 4. Send Email and WAIT for it to finish
      // We must await so the serverless function doesn't die mid-send
      console.log(`📧 Sending email for payment ${payment.id}...`);
      await sendPaymentNotification({
        amount: amountStr,
        customerName,
        customerEmail: payment.buyer_email_address || "Check Square Dashboard",
        method: methodStr,
        transactionId: payment.id,
        timestamp: new Date(),
        paymentJson: JSON.stringify(event, null, 2),
      });
      console.log(`✅ Email sent successfully for ${payment.id}`);

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 5. If it's NOT 'COMPLETED', we still return 200 so Square is happy
    console.log(`ℹ️ Event ${event.type} (${payment?.status}) ignored - no email sent.`);
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error: any) {
    console.error('❌ Webhook Error:', error.message);
    // Return 200 even on error during testing to stop Square's retry storm
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}