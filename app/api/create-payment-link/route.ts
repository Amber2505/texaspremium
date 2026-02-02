/* eslint-disable @typescript-eslint/no-require-imports */
// app/api/create-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";

// ✅ Use your original imports that were working
const square = require("square");

// Since SquareClient worked for you before, let's use that pattern
const client = new square.SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: square.SquareEnvironment.Production,
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

    // ✅ Use your original API path that was working
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      quickPay: {
        name: description,
        priceMoney: {
          amount: amountInCents,
          currency: "USD",
        },
        locationId: locationId, // ✅ THE ONLY FIX NEEDED - This was missing!
      },
      checkoutOptions: {
        redirectUrl: `https://www.texaspremiumins.com/${language}/setup-autopay?method=${paymentMethod}&phone=${customerPhone}&redirect=payment`,
        askForShippingAddress: false,
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
  } catch (error: unknown) {
    console.error("Square API Error:", error);
    
    let detail = "An unknown error occurred";

    if (error && typeof error === 'object' && 'errors' in error) {
      const squareError = error as { errors?: Array<{ detail?: string; category?: string; code?: string }> };
      const firstError = squareError.errors?.[0];
      if (firstError) {
        detail = `${firstError.category || 'Error'}: ${firstError.detail || firstError.code || 'Unknown error'}`;
      }
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