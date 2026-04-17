// app/api/update-payment-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

// ✅ Helper: accepts both publicLinkId and legacy ObjectId
function buildLinkQuery(linkId: string) {
  if (/^[a-f0-9]{32}$/i.test(linkId)) {
    return { publicLinkId: linkId };
  }
  if (linkId.length === 24 && ObjectId.isValid(linkId)) {
    return { _id: new ObjectId(linkId) };
  }
  return null;
}

async function updateSquareDescription(squareLinkId: string, description: string) {
  try {
    if (!squareLinkId) return;

    const getRes = await fetch(
      `https://connect.squareup.com/v2/online-checkout/payment-links/${squareLinkId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "Square-Version": "2024-01-18",
        },
      }
    );

    const getData = await getRes.json();
    const version = getData.payment_link?.version;

    if (!version) {
      console.error("Could not retrieve Square link version", getData);
      return;
    }

    console.log(
      "Updating Square link:",
      squareLinkId,
      "with description:",
      description,
      "version:",
      version
    );

    const updateRes = await fetch(
      `https://connect.squareup.com/v2/online-checkout/payment-links/${squareLinkId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "Square-Version": "2024-01-18",
        },
        body: JSON.stringify({
          payment_link: {
            version,
            quick_pay: { name: description },
          },
        }),
      }
    );

    const updateData = await updateRes.json();
    console.log("Square update response:", updateRes.status, JSON.stringify(updateData));
    if (!updateRes.ok) {
      console.error("Square update failed:", JSON.stringify(updateData));
    }
  } catch (err) {
    console.error("Failed to update Square description:", err);
  }
}

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;

  try {
    const body = await request.json();
    const {
      linkId,
      generatedLink,
      squareLink,
      squareLinkId,
      squareTransactionId,
      description,
    } = body;
    let existingSquareLinkId: string | null = null;

    if (!linkId) {
      return NextResponse.json(
        { error: "Link ID is required" },
        { status: 400 }
      );
    }

    const query = buildLinkQuery(linkId);
    if (!query) {
      return NextResponse.json(
        { error: "Invalid linkId format" },
        { status: 400 }
      );
    }

    client = await MongoClient.connect(uri);
    const db = client.db("db");
    const collection = db.collection("payment_link_generated");

    const updateFields: Record<string, string> = {};
    if (generatedLink) updateFields.generatedLink = generatedLink;
    if (squareLink) updateFields.squareLink = squareLink;
    if (squareLinkId) updateFields.squareLinkId = squareLinkId;
    if (squareTransactionId) updateFields.squareTransactionId = squareTransactionId;
    if (description !== undefined) updateFields.description = description;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    if (description !== undefined) {
      const existing = await collection.findOne(query, {
        projection: { squareLinkId: 1 },
      });
      existingSquareLinkId = existing?.squareLinkId || null;
    }

    const result = await collection.updateOne(query, { $set: updateFields });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (description !== undefined && existingSquareLinkId) {
      await updateSquareDescription(existingSquareLinkId, description);
    }

    return NextResponse.json({
      success: true,
      message: "Link updated successfully",
    });
  } catch (error: unknown) {
    console.error("Error updating payment link:", error);
    return NextResponse.json(
      { error: "Failed to update link" },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}