// app/api/create-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { amount, description, customerPhone, paymentMethod, language } = await request.json();

    if (!amount || !description || !customerPhone || !paymentMethod) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const lang = language || "en";

    // Create the redirect URL
    let redirectUrl: string;
    if (paymentMethod === "direct-bill") {
      redirectUrl = `https://www.texaspremiumins.com/${lang}/payment-thankyou`;
    } else {
      redirectUrl = `https://www.texaspremiumins.com/${lang}/setup-autopay?${paymentMethod}&phone=${customerPhone}&redirect=payment`;
    }

    // ✅ Call Square API directly with fetch
    const squareResponse = await fetch(
      process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com/v2/online-checkout/payment-links"
        : "https://connect.squareupsandbox.com/v2/online-checkout/payment-links",
      {
        method: "POST",
        headers: {
          "Square-Version": "2024-01-18",
          "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          quick_pay: {
            name: description,
            price_money: {
              amount: amount,
              currency: "USD",
            },
            location_id: process.env.SQUARE_LOCATION_ID,
          },
          checkout_options: {
            redirect_url: redirectUrl,
            ask_for_shipping_address: false,
          },
        }),
      }
    );

    if (!squareResponse.ok) {
      const errorData = await squareResponse.json();
      console.error("Square API Error:", errorData);
      return NextResponse.json(
        { error: errorData.errors?.[0]?.detail || "Failed to create payment link" },
        { status: squareResponse.status }
      );
    }

    const data = await squareResponse.json();

    return NextResponse.json({
      paymentLink: data.payment_link?.url,
      orderId: data.payment_link?.order_id,
      redirectUrl: redirectUrl,
    });
  } catch (error) {
    console.error("Square API error:", error);
    return NextResponse.json(
      { error: "Failed to create payment link" },
      { status: 500 }
    );
  }
}