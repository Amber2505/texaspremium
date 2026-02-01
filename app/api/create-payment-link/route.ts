import { NextRequest, NextResponse } from "next/server";
// Import SquareError along with the other members
import { SquareClient, SquareEnvironment, SquareError } from "square";

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production, 
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, description, customerPhone, paymentMethod, language } = body;

    if (!amount || !description || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const locationId = process.env.SQUARE_LOCATION_ID!;
    const amountInCents = BigInt(Math.round(amount));

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      checkoutOptions: {
        redirectUrl: `https://www.texaspremiumins.com/${language}/setup-autopay?method=${paymentMethod}&phone=${customerPhone}&redirect=payment`,
        askForShippingAddress: false,
      },
      quickPay: {
        name: description,
        priceMoney: {
          amount: amountInCents,
          currency: "USD",
        },
        locationId: locationId,
      },
    });

    const paymentLinkUrl = response.paymentLink?.url;

    if (paymentLinkUrl) {
      return NextResponse.json({
        success: true,
        paymentLink: paymentLinkUrl,
      });
    } else {
      return NextResponse.json(
        { error: "Square API did not return a URL" },
        { status: 500 }
      );
    }
  } catch (error: unknown) { // Use 'unknown' instead of 'any'
    console.error("Square API Error:", error);
    
    let detail = "An unknown error occurred";

    // Type guard to check if the error is a Square-specific error
    if (error instanceof SquareError) {
      // SquareError has an 'errors' array with detailed information
      detail = error.errors?.[0]?.detail ?? error.message;
    } else if (error instanceof Error) {
      // Standard JavaScript error fallback
      detail = error.message;
    }

    return NextResponse.json(
      {
        error: "Failed to create payment link",
        details: detail,
      },
      { status: 500 }
    );
  }
}