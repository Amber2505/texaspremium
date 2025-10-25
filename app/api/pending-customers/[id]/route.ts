import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ← Changed this line
) {
  try {
    const { id } = await params;  // ← Changed this line (added await)

    if (!id) {
      return NextResponse.json(
        { error: 'Missing customer ID' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('db');

    const customer = await db
      .collection('customer_policyandclaim_info')
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error fetching pending customer:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}