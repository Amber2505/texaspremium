import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

// ✅ CORRECT: CommonJS import with proper destructuring
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client, Environment } = require('square');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactionId } = body;

    console.log("📧 Notify payment triggered for transaction:", transactionId);

    // ✅ CORRECT: CommonJS syntax - Client with accessToken
    const squareClient = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production,
    });

    let amount = "Payment received via Square";
    let customerName = "Square Customer";
    let customerEmail = "Check Square Dashboard";

    // Try to fetch payment details from Square
    try {
      console.log("🔍 Fetching payment from Square API...");
      
      const { result } = await squareClient.paymentsApi.getPayment(transactionId);
      
      console.log("✅ Square API response:", JSON.stringify(result, null, 2));

      if (result.payment) {
        const payment = result.payment;
        
        // Format amount (Square uses cents)
        if (payment.amountMoney?.amount) {
          const amountInDollars = Number(payment.amountMoney.amount) / 100;
          amount = `$${amountInDollars.toFixed(2)} ${payment.amountMoney.currency || 'USD'}`;
        }

        // Get customer email
        if (payment.buyerEmailAddress) {
          customerEmail = payment.buyerEmailAddress;
        }

        // Try to get customer details
        if (payment.customerId) {
          try {
            const customerResponse = await squareClient.customersApi.retrieveCustomer(payment.customerId);
            if (customerResponse.result.customer) {
              const customer = customerResponse.result.customer;
              const firstName = customer.givenName || '';
              const lastName = customer.familyName || '';
              customerName = `${firstName} ${lastName}`.trim() || customer.emailAddress || "Square Customer";
              
              if (customer.emailAddress) {
                customerEmail = customer.emailAddress;
              }
            }
          } catch (customerError) {
            console.warn("⚠️ Could not fetch customer details:", customerError);
          }
        }

        console.log("📊 Extracted payment info:", { amount, customerName, customerEmail });
      }
    } catch (squareError: unknown) {
      console.error("❌ Square API error:", squareError);
      console.error("❌ Full error:", JSON.stringify(squareError, null, 2));
      if (squareError && typeof squareError === 'object' && 'message' in squareError) {
        console.error("Error details:", {
          message: (squareError as { message?: string }).message,
          errors: (squareError as { errors?: unknown }).errors,
          statusCode: (squareError as { statusCode?: number }).statusCode,
        });
      }
      // Continue with fallback values
    }

    // Send email notification
    console.log("📧 Sending email notification...");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `💰 New Square Payment: ${amount}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">New Payment Received via Square</h2>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Payment Details</h3>
            <p><strong>Amount:</strong> ${amount}</p>
            <p><strong>Customer Name:</strong> ${customerName}</p>
            <p><strong>Customer Email:</strong> ${customerEmail}</p>
            <p><strong>Transaction ID:</strong> ${transactionId}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
          </div>

          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #1976d2;">
              <strong>🔗 View in Square Dashboard:</strong><br/>
              <a href="https://squareup.com/dashboard/sales/transactions/${transactionId}" 
                 style="color: #1976d2;">
                Click here to view transaction
              </a>
            </p>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated notification from Texas Premium Insurance Services.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");

    return NextResponse.json({
      success: true,
      message: "Payment notification sent",
      paymentInfo: {
        amount,
        customerName,
        customerEmail,
        transactionId,
      },
    });
  } catch (error: unknown) {
    console.error("❌ Notify payment error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        error: "Failed to send payment notification",
        errorMessage,
        stack: errorStack,
      },
      { status: 500 }
    );
  }
}