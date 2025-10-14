import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    
    const customers = await db
      .collection('payment_reminder_coll')
      .find({})
      .toArray();

    // Update overdue status based on current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updatedCustomers = customers.map((customer) => {
      if (customer.status === 'active') {
        const dueDate = new Date(customer.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate < today) {
          return {
            ...customer,
            status: 'overdue',
          };
        }
      }
      return customer;
    });

    // Update overdue customers in database
    const bulkOps = updatedCustomers
      .filter((customer, index) => {
        const original = customers[index];
        return original.status === 'active' && customer.status === 'overdue';
      })
      .map((customer) => ({
        updateOne: {
          filter: { _id: customer._id },
          update: { $set: { status: 'overdue' } },
        },
      }));

    if (bulkOps.length > 0) {
      await db.collection('payment_reminder_coll').bulkWrite(bulkOps);
    }

    return NextResponse.json(updatedCustomers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const customer = await request.json();

    await db.collection('payment_reminder_coll').insertOne(customer);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding customer:', error);
    return NextResponse.json(
      { error: 'Failed to add customer' },
      { status: 500 }
    );
  }
}