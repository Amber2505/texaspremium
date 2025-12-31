import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';
import { WebhooksHelper } from 'square';

export async function POST(request: Request) {
  // CLONE the request for processing later so we can respond to Square immediately
  const bodyText = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature') || '';
  
  // 1. Respond to Square IMMEDIATELY
  // This stops the 3-email retry loop because Square gets its "Success" signal instantly.
  const response = NextResponse.json({ success: true }, { status: 200 });

  // 2. Process everything else in the background
  (async () => {
    try {
      // Use the actual URL of your webhook
      const notificationUrl = process.env.SQUARE_NOTIFICATION_URL || 'https://www.texaspremiumins.com/api/square-webhook';
      
      const isValid = WebhooksHelper.verifySignature({
        requestBody: bodyText,
        signatureHeader: signature,
        signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
        notificationUrl: notificationUrl,
      });

      if (!isValid) {
        console.error("❌ Square Webhook: Signature verification failed");
        return;
      }

      const event = JSON.parse(bodyText);
      const payment = event.data?.object?.payment;

      console.log(`📩 Webhook Received | Event: ${event.type} | Status: ${payment?.status}`);

      // ONLY send email if status is COMPLETED
      if (event.type === 'payment.updated' && payment?.status === 'COMPLETED') {
        const money = payment.amount_money || payment.total_money;
        const amountStr = `$${(Number(money.amount) / 100).toFixed(2)} ${money.currency}`;

        const billing = payment.billing_address;
        const customerName = `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || 
                             payment.card_details?.cardholder_name || "Guest";

        const card = payment.card_details?.card;
        const methodStr = `${card?.card_brand || "CARD"} **** ${card?.last_4 || ""} (Exp: ${card?.exp_month}/${card?.exp_year})`;

        console.log(`📧 Sending email for payment ${payment.id}...`);
        
        await sendPaymentNotification({
          amount: amountStr,
          customerName,
          customerEmail: payment.buyer_email_address || "Check Dashboard",
          method: methodStr,
          transactionId: payment.id,
          timestamp: new Date(),
          paymentJson: JSON.stringify(event, null, 2),
        });

        console.log(`✅ Email sent successfully for ${payment.id}`);
      }
    } catch (error: any) {
      console.error('❌ Background Webhook Error:', error.message);
    }
  })();

  return response;
}