import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
  let client: MongoClient | null = null;
  try {
    const { linkId } = await req.json();
    client = await MongoClient.connect(process.env.MONGODB_URI!);
    await client.db("db").collection("payment_link_generated").deleteOne({ _id: new ObjectId(linkId) });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  } finally {
    if (client) await client.close();
  }
}