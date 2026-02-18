import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

export async function GET(request: NextRequest) {
    let client: MongoClient | null = null;
    try {
        const linkId = request.nextUrl.searchParams.get("linkId");
        if (!linkId) return NextResponse.json({ success: false });

        client = await MongoClient.connect(uri);
        const db = client.db("db");

        const link = await db.collection("payment_link_generated").findOne(
            { _id: new ObjectId(linkId) }
        );

        if (!link) return NextResponse.json({ success: false });

        const payment = await db.collection("completed_payments").findOne(
            { customerPhone: link.customerPhone },
            { sort: { processedAt: -1 } }
        );

        return NextResponse.json({
            success: true,
            email: payment?.customerEmail || "",
            cardLast4: payment?.cardLast4 || "",
            customerName: payment?.customerName || "",
        });
    } catch {
        return NextResponse.json({ success: false });
    } finally {
        if (client) await client.close();
    }
}