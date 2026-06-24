// api/messages/set-language/route.ts
/*eslint-disable @typescript-eslint/no-explicit-any*/
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function POST(req: NextRequest) {
  let client: MongoClient | null = null;
  try {
    const { conversationId, language } = await req.json();
    if (!conversationId || !["en", "es"].includes(language)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    client = await MongoClient.connect(uri);
    const col = client.db("db").collection("texas_premium_messages");
    await col.updateOne(
      { conversationId },
      { $set: { language, updatedAt: new Date() } },
      { upsert: false }
    );
    return NextResponse.json({ success: true, language });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.close();
  }
}