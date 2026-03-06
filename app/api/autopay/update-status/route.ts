import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
  try {
    const { id, completed } = await req.json();
    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    await db.collection("autopay_customers").updateOne(
      { _id: new ObjectId(id) },
      { $set: { completed } }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update status error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}