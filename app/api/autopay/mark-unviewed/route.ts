import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    await autopayCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { accessLog: [] } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Mark unviewed error:', error);
    return NextResponse.json({ error: 'Failed to mark as unviewed' }, { status: 500 });
  }
}