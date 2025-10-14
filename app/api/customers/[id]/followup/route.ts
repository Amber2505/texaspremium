import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const { followUpIndex, status } = await request.json();
    const { id } = await params; // Await params before accessing properties
    
    await db.collection('payment_reminder_coll').updateOne(
      { id },
      { 
        $set: { 
          [`followUps.${followUpIndex}.status`]: status,
          lastContact: new Date().toISOString()
        } 
      }
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating follow-up:', error);
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 });
  }
}