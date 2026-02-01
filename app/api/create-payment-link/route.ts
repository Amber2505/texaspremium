// app/api/create-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";
// ✅ New names for v44
import { SquareClient, SquareEnvironment, SquareError } from "square";

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!, // ✅ 'accessToken' is now 'token'
  environment: SquareEnvironment.Production, // ✅ 'Environment' is now 'SquareEnvironment'
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

    // ✅ v44 Path: client.checkout.paymentLinks.create
    // Note: The '.result' wrapper is gone in v44
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      quickPay: {
        name: description,
        priceMoney: {
          amount: amountInCents,
          currency: "USD",
        },
        locationId: locationId,
      },
      checkoutOptions: {
        redirectUrl: `https://www.texaspremiumins.com/${language}/setup-autopay?method=${paymentMethod}&phone=${customerPhone}&redirect=payment`,
        askForShippingAddress: false,
      },
    });

    // ✅ In v44, access properties directly on the response
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
  } catch (error: unknown) {
    console.error("Square API Error:", error);
    
    let detail = "An unknown error occurred";

    // ✅ Proper type checking for SquareError in v44
    if (error instanceof SquareError) {
      detail = error.errors?.[0]?.detail ?? "Square API error";
    } else if (error instanceof Error) {
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