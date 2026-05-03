import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db("db");
    const { policyNo, companyName } = await request.json();

    const updateFields: Record<string, string> = {};
    if (policyNo !== undefined) updateFields.policy_no = policyNo;
    if (companyName !== undefined) updateFields.company_name = companyName;

    await db
      .collection("customer_policyandclaim_info")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating pending customer info:", error);
    return NextResponse.json(
      { error: "Failed to update" },
      { status: 500 },
    );
  }
}