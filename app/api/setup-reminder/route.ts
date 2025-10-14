import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

type FollowUp = {
  date: string;
  type: string;
  description: string;
  status: string;
  method: string;
};

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateFollowUps(
  dueDate: Date,
  paymentType: string,
  expirationDate: Date,
  totalPayments: number
): FollowUp[] {
  const followUps: FollowUp[] = [];

  // Monthly payment follow-ups
  if (paymentType === 'regular') {
    followUps.push(
      {
        date: addDays(dueDate, -3).toISOString(),
        type: 'pre-reminder',
        description: 'Upcoming payment reminder',
        status: 'pending',
        method: 'sms',
      },
      {
        date: dueDate.toISOString(),
        type: 'due-date',
        description: 'Payment due today',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(dueDate, 5).toISOString(),
        type: 'overdue',
        description: 'Still unpaid - follow up',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDays(dueDate, 7).toISOString(),
        type: 'overdue',
        description: 'Second follow-up',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDays(dueDate, 9).toISOString(),
        type: 'final',
        description: 'Final reminder (last day)',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(dueDate, 12).toISOString(),
        type: 'post-cancellation',
        description: 'First reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(dueDate, 14).toISOString(),
        type: 'post-cancellation',
        description: 'Second reinstatement opportunity',
        status: 'pending',
        method: 'phone',
      }
    );
  } else if (paymentType === 'autopay') {
    followUps.push(
      {
        date: addDays(dueDate, -3).toISOString(),
        type: 'pre-check',
        description: 'Check autopay schedule',
        status: 'pending',
        method: 'sms',
      },
      {
        date: dueDate.toISOString(),
        type: 'due-date',
        description: 'Confirm autopay succeeded',
        status: 'pending',
        method: 'sms',
      },
      {
        date: addDays(dueDate, 7).toISOString(),
        type: 'verification',
        description: 'Verify payment posted correctly',
        status: 'pending',
        method: 'email',
      }
    );
  } else if (paymentType === 'paid-in-full') {
    followUps.push({
      date: addDays(dueDate, -20).toISOString(),
      type: 'renewal',
      description: 'Check renewal pricing & inform',
      status: 'pending',
      method: 'phone',
    });
  }

  // RENEWAL REMINDERS - Add for all payment types
  const lastDay = addDays(expirationDate, -1);

  if (totalPayments >= 6) {
    // 6-month or 12-month policy
    followUps.push(
      {
        date: addDays(expirationDate, -15).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 15 days before expiration',
        status: 'pending',
        method: 'phone',
      },
      {
        date: addDays(expirationDate, -3).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 3 days before expiration',
        status: 'pending',
        method: 'email',
      },
      {
        date: lastDay.toISOString(),
        type: 'renewal',
        description: 'URGENT: Policy expires tomorrow - Last day to renew',
        status: 'pending',
        method: 'phone',
      }
    );
  } else {
    // Month-to-month policy
    followUps.push(
      {
        date: addDays(expirationDate, -5).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 5 days before expiration',
        status: 'pending',
        method: 'email',
      },
      {
        date: addDays(expirationDate, -2).toISOString(),
        type: 'renewal',
        description: 'Renewal reminder - 2 days before expiration',
        status: 'pending',
        method: 'phone',
      },
      {
        date: lastDay.toISOString(),
        type: 'renewal',
        description: 'URGENT: Policy expires tomorrow - Last day to renew',
        status: 'pending',
        method: 'phone',
      }
    );
  }

  return followUps;
}

export async function POST(request: Request) {
  try {
    console.log('🔵 Setup reminder API called');
    
    // Parse request body
    const body = await request.json();
    console.log('📦 Request body:', body);
    const { policyNo, dueDate, paymentType } = body;

    if (!policyNo || !dueDate || !paymentType) {
      console.error('❌ Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: policyNo, dueDate, or paymentType' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const client = await clientPromise;
    const db = client.db('db');
    console.log('✅ Connected to MongoDB');

    // Find the pending customer
    console.log('🔍 Looking for pending customer with policy:', policyNo);
    const pendingCustomer = await db
      .collection('customer_policyandclaim_info')
      .findOne({ policy_no: policyNo });

    if (!pendingCustomer) {
      console.error('❌ Pending customer not found');
      return NextResponse.json(
        { error: 'Pending customer not found' },
        { status: 404 }
      );
    }
    console.log('✅ Found pending customer:', pendingCustomer.customer_name);

    // Validate dates
    if (!pendingCustomer.effective_date || !pendingCustomer.expiration_date) {
      console.error('❌ Missing dates in pending customer');
      return NextResponse.json(
        { error: 'Pending customer missing effective_date or expiration_date' },
        { status: 400 }
      );
    }

    const effectiveDate = new Date(pendingCustomer.effective_date);
    const expirationDate = new Date(pendingCustomer.expiration_date);
    console.log('📅 Policy dates - Effective:', effectiveDate, 'Expiration:', expirationDate);

    // Calculate total payments based on policy duration
    const diffMonths = Math.ceil(
      (expirationDate.getTime() - effectiveDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );
    const totalPayments = diffMonths >= 12 ? 12 : diffMonths;
    console.log('💰 Total payments calculated:', totalPayments);

    // Parse the due date properly
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsedDueDate = new Date(year, month - 1, day, 12, 0, 0, 0);
    console.log('📅 Parsed due date:', parsedDueDate);

    // Generate follow-ups with updated rules
    console.log('📋 Generating follow-ups...');
    const followUps = generateFollowUps(
      parsedDueDate,
      paymentType,
      expirationDate,
      totalPayments
    );
    console.log('✅ Generated', followUps.length, 'follow-ups');

    // Create the customer document
    const customer = {
      id: policyNo,
      name: pendingCustomer.customer_name,
      dueDate: parsedDueDate.toISOString(),
      paymentDayOfMonth: parsedDueDate.getDate(),
      remainingPayments: totalPayments,
      totalPayments: totalPayments,
      expirationDate: expirationDate.toISOString(),
      status: 'active',
      paymentType: paymentType,
      followUps: followUps,
    };

    // Insert into payment_reminder_coll
    console.log('💾 Inserting into payment_reminder_coll...');
    await db.collection('payment_reminder_coll').insertOne(customer);
    console.log('✅ Customer inserted successfully');

    // Remove from pending_customers_coll
    console.log('🗑️ Removing from pending_customers_coll...');
    await db.collection('pending_customers_coll').deleteOne({ policy_no: policyNo });
    console.log('✅ Pending customer removed');

    console.log('🎉 Setup reminder completed successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error setting up reminder:', error);
    return NextResponse.json(
      { 
        error: 'Failed to setup reminder',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}