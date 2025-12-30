import { NextResponse } from "next/server";
import { sendPaymentNotification } from '@/lib/email';
import { SquareClient, SquareEnvironment, SquareError } from 'square';

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? SquareEnvironment.Production 
    : SquareEnvironment.Sandbox,
});

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json();
    const response = await client.payments.get({ paymentId: transactionId });
    const payment = response.payment;

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Extraction Logic with TS Fix
    let customerName = "Guest Customer";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardDetails = payment.cardDetails as any; // Bypass strict TS check for property names

    if (cardDetails?.cardholderName) {
      customerName = cardDetails.cardholderName;
    } else if (payment.note) {
      customerName = payment.note;
    }

    const customerEmail = payment.buyerEmailAddress || "Check Square Dashboard";
    const cardBrand = cardDetails?.card?.cardBrand || "Credit Card";
    
    const amountStr = `$${(Number(payment.amountMoney?.amount) / 100).toFixed(2)} ${payment.amountMoney?.currency}`;

    await sendPaymentNotification({
      amount: amountStr,
      customerName,
      customerEmail,
      method: cardBrand,
      transactionId: payment.id!,
      timestamp: new Date(),
      paymentJson: JSON.stringify(payment, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
      ),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    let message = "Internal Server Error";
    if (error instanceof SquareError) {
      message = error.errors?.[0]?.detail || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error("Notify API Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}