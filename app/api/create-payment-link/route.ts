/* eslint-disable @typescript-eslint/no-require-imports */
// app/api/create-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";

const square = require("square");

const client = new square.SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: square.SquareEnvironment.Production,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // ✅ REMOVED customerEmail from requirements
    const { amount, description, customerPhone, paymentMethod, language } = body;

    if (!amount || !description || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields (amount, description, customerPhone)" },
        { status: 400 }
      );
    }

    const locationId = process.env.SQUARE_LOCATION_ID!;
    const amountInCents = BigInt(Math.round(amount));

    // ✅ Create a reference ID to store metadata
    const referenceData = {
      customerPhone,
      paymentMethod,
      language,
    };
    const referenceId = JSON.stringify(referenceData);

    // ✅ Updated redirect URL to go to payment-processing page
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
        // ✅ NEW: Redirect to processing page instead of directly to consent
        redirectUrl: `https://www.texaspremiumins.com/${language}/payment-processing?method=${paymentMethod}&phone=${encodeURIComponent(customerPhone)}`,
        askForShippingAddress: false,
      },
      // ✅ Store metadata in reference_id for webhook to retrieve
      paymentNote: referenceId,
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