import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params promise
    const { id } = await params;
    
    const client = await clientPromise;
    const db = client.db('db');
   
    const result = await db.collection('payment_reminder_coll').deleteOne({ id });
   
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
   
    return NextResponse.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}