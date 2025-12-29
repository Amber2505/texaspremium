import { NextResponse } from "next/server";
import { sendPaymentNotification } from '@/lib/email';
import { SquareClient, SquareEnvironment } from 'square';

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? SquareEnvironment.Production 
    : SquareEnvironment.Sandbox,
});

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json();

    // v43 uses .get({ paymentId: ... })
    const { payment } = await client.payments.get({ paymentId: transactionId });

    if (!payment || payment.status !== 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Payment not completed' });
    }

    let customerName = payment.note || "Square Customer";
    let customerEmail = payment.buyerEmailAddress || "Check Dashboard";

    // v43 uses .get({ customerId: ... })
    if (payment.customerId) {
      try {
        const { customer } = await client.customers.get({ customerId: payment.customerId });
        if (customer) {
          customerName = `${customer.givenName || ''} ${customer.familyName || ''}`.trim();
          customerEmail = customer.emailAddress || customerEmail;
        }
      } catch (e) {
        console.warn("Profile fetch failed");
      }
    }

    const amountStr = `$${(Number(payment.amountMoney?.amount) / 100).toFixed(2)} ${payment.amountMoney?.currency}`;

    await sendPaymentNotification({
      amount: amountStr,
      customerName,
      customerEmail,
      transactionId: payment.id!,
      timestamp: new Date(),
      paymentJson: JSON.stringify(payment, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
      ),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}