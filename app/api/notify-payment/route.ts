import { NextResponse } from "next/server";
import { sendPaymentNotification } from '@/lib/email';
import { SquareClient, SquareEnvironment, SquareError } from 'square'; // Added SquareError

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? SquareEnvironment.Production 
    : SquareEnvironment.Sandbox,
});

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json();
    const { payment } = await client.payments.get({ paymentId: transactionId });

    if (!payment || payment.status !== 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Payment not completed' });
    }

    let customerName = payment.note || "Square Customer";
    let customerEmail = payment.buyerEmailAddress || "Check Dashboard";

    if (payment.customerId) {
      try {
        const { customer } = await client.customers.get({ customerId: payment.customerId });
        if (customer) {
          customerName = `${customer.givenName || ''} ${customer.familyName || ''}`.trim();
          customerEmail = customer.emailAddress || customerEmail;
        }
      } catch (e) {
        console.warn("Profile fetch failed:", e);
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
  } catch (error: unknown) { // Change 'any' to 'unknown'
    let message = "Internal Server Error";
    
    // Type guard for Square-specific errors
    if (error instanceof SquareError) {
      message = error.errors?.[0]?.detail || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    console.error("API Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}