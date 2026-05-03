// app/api/customers/[id]/info/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = await clientPromise;
    const db = client.db("db");
    const { policyNo, companyName } = await request.json();

    const customer = await db
      .collection("payment_reminder_coll")
      .findOne({ id });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const updateFields: Record<string, string> = {};
    if (companyName !== undefined) updateFields.companyName = companyName;

    // If policy number is changing, update the id field too
    if (policyNo !== undefined && policyNo !== id) {
      // Check the new policy number isn't already taken
      const existing = await db
        .collection("payment_reminder_coll")
        .findOne({ id: policyNo });
      if (existing) {
        return NextResponse.json(
          { error: "Policy number already exists" },
          { status: 409 },
        );
      }
      updateFields.id = policyNo;
    }

    await db
      .collection("payment_reminder_coll")
      .updateOne({ id }, { $set: updateFields });

    return NextResponse.json({ success: true, newId: updateFields.id ?? id });
  } catch (error) {
    console.error("Error updating customer info:", error);
    return NextResponse.json(
      { error: "Failed to update customer info" },
      { status: 500 },
    );
  }
}