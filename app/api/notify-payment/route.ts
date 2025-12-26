import { NextResponse } from 'next/server';
import { sendPaymentNotification } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const transactionId = body.transactionId;

    // ✅ FIXED: Changed "bodull" to "body" and fixed JSON.stringify parameters
    const rawRequestBody = JSON.stringify(body, null, 2);

    // If we have a transaction ID, fetch real payment details from Square
    if (transactionId && transactionId !== 'Unknown') {
      try {
        // Dynamic import with type assertion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const square = await import('square') as any;
        const { Client, Environment } = square;
        
        // Initialize Square client
        const client = new Client({
          bearerAuthCredentials: {
            accessToken: process.env.SQUARE_ACCESS_TOKEN,
          },
          environment: Environment.Production,
        });

        const { result } = await client.paymentsApi.getPayment(transactionId);
        const payment = result.payment;

        // Log the entire payment object to console
        console.log('FULL PAYMENT OBJECT:', JSON.stringify(payment, null, 2));

        if (payment) {
          await sendPaymentNotification({
            amount: payment.amountMoney ? `$${(Number(payment.amountMoney.amount) / 100).toFixed(2)}` : 'N/A',
            customerName: payment.buyerEmailAddress || 'Customer',
            customerEmail: payment.buyerEmailAddress || 'N/A',
            transactionId: payment.id || transactionId,
            timestamp: payment.createdAt ? new Date(payment.createdAt) : new Date(),
            paymentJson: JSON.stringify({
              squarePayment: payment,
              originalRequest: body
            }, null, 2),
          });

          return NextResponse.json({ success: true, message: 'Notification sent with payment details' });
        }
      } catch (squareError) {
        console.error('Square API error:', squareError);
        // Square API failed - send notification with error info and raw request
        await sendPaymentNotification({
          amount: body.amount || 'See JSON below',
          customerName: body.customerName || 'See JSON below',
          customerEmail: body.customerEmail || 'See JSON below',
          transactionId: transactionId || 'Unknown',
          timestamp: new Date(),
          paymentJson: JSON.stringify({
            error: 'Square API lookup failed',
            errorMessage: String(squareError),
            originalRequest: body
          }, null, 2),
        });

        return NextResponse.json({ success: true, message: 'Notification sent (Square API failed)' });
      }
    }

    // Fallback: send notification with raw request body
    await sendPaymentNotification({
      amount: body.amount || 'See JSON below',
      customerName: body.customerName || 'See JSON below',
      customerEmail: body.customerEmail || 'See JSON below',
      transactionId: transactionId || 'Unknown',
      timestamp: new Date(),
      paymentJson: rawRequestBody, // Always include raw body
    });

    return NextResponse.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}