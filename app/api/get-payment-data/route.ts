// app/api/get-payment-data/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

/**
 * GET handler to retrieve payment data after Square redirection.
 * Supports searching by Payment ID (_id), Order ID, or Transaction ID.
 */
export async function GET(request: Request) {
  try {
    // 1. Extract the 'id' query parameter from the URL
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // 2. Validate that an ID was actually provided
    if (!id) {
      console.error('❌ GET Payment Data: Missing ID parameter');
      return NextResponse.json(
        { success: false, error: 'Missing payment ID' }, 
        { status: 400 }
      );
    }

    // 3. Connect to the database
    const db = await getDatabase('db');
    const paymentsCollection = db.collection("completed_payments");

    // 4. Search the collection using an $or query.
    // This handles the "ID mismatch" because it looks in all possible fields.
    const payment = await paymentsCollection.findOne({
      $or: [
        { _id: id as any },      // Check if it's the primary Payment ID
        { orderId: id },         // Check if it's the Square Order ID
        { transactionId: id }    // Check if it's the Transaction ID
      ]
    });

    // 5. If no payment is found yet, return a 404. 
    // The frontend will catch this and retry.
    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'Payment record not found yet' }, 
        { status: 404 }
      );
    }

    // 6. Return the found payment data
    return NextResponse.json({ 
      success: true, 
      payment 
    });

  } catch (error: any) {
    console.error('❌ GET Payment Data Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}