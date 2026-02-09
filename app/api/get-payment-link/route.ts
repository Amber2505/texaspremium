// app/api/get-payment-link/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json(
        { success: false, error: "Link ID required" },
        { status: 400 }
      );
    }

    const db = await getDatabase("db");
    const linksCollection = db.collection("payment_link_generated");

    // Try to find the link by _id
    let link;
    try {
      link = await linksCollection.findOne({ _id: new ObjectId(linkId) });
    } catch (e) {
      // If ObjectId conversion fails, the ID format is invalid
      console.error("Invalid ObjectId format:", linkId);
      return NextResponse.json({
        success: false,
        error: "Invalid link ID format",
      });
    }

    if (link) {
      return NextResponse.json({
        success: true,
        link: {
          _id: link._id.toString(),
          linkType: link.linkType,
          amount: link.amount,
          description: link.description,
          customerPhone: link.customerPhone,
          customerEmail: link.customerEmail || null,
          paymentMethod: link.paymentMethod,
          language: link.language,
          generatedLink: link.generatedLink,
          squareLink: link.squareLink,
          disabled: link.disabled || false,
          createdAt: link.createdAt,
          createdAtTimestamp: link.createdAtTimestamp,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Payment link not found",
      });
    }
  } catch (error) {
    console.error("Error fetching payment link:", error);
    return NextResponse.json(
      { success: false, error: "Database error" },
      { status: 500 }
    );
  }
}