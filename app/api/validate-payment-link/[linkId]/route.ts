// app/api/validate-payment-link/[linkId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  let client: MongoClient | null = null;

  try {
    const { linkId } = await params;

    if (!linkId) {
      return NextResponse.json(
        { error: "Link ID is required" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    // Find the link by ID
    const link = await collection.findOne({ _id: new ObjectId(linkId) });

    if (!link) {
      return NextResponse.json(
        { error: "Link not found", disabled: false },
        { status: 404 }
      );
    }

    // Check if disabled
    if (link.disabled === true) {
      return NextResponse.json({
        disabled: true,
        message: "This link has been disabled",
      });
    }

    // Return the Square payment link
    return NextResponse.json({
      disabled: false,
      squareLink: link.squareLink, // The actual Square URL
    });
  } catch (error: unknown) {
    console.error("Error validating payment link:", error);
    return NextResponse.json(
      { error: "Failed to validate link" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}