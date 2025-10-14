import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

interface FollowUp {
  date: string;
  type: string;
  description: string;
  status: string;
  method: string;
}

function generateFollowUps(dueDate: Date, paymentType: string): FollowUp[] {
  const followUps: FollowUp[] = [];
  
  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  
  if (paymentType === "regular") {
    followUps.push(
      { date: addDays(dueDate, -2).toISOString(), type: "pre-reminder", description: "Upcoming payment reminder", status: "pending", method: "email" },
      { date: dueDate.toISOString(), type: "due-date", description: "Payment due today", status: "pending", method: "phone" },
      { date: addDays(dueDate, 5).toISOString(), type: "overdue", description: "Still unpaid - follow up", status: "pending", method: "phone" },
      { date: addDays(dueDate, 7).toISOString(), type: "overdue", description: "Second follow-up", status: "pending", method: "sms" },
      { date: addDays(dueDate, 9).toISOString(), type: "final", description: "Final reminder (last day)", status: "pending", method: "phone" }
    );
  } else if (paymentType === "autopay") {
    followUps.push(
      { date: addDays(dueDate, -2).toISOString(), type: "pre-check", description: "Check autopay schedule", status: "pending", method: "email" },
      { date: dueDate.toISOString(), type: "due-date", description: "Confirm autopay succeeded", status: "pending", method: "email" },
      { date: addDays(dueDate, 7).toISOString(), type: "verification", description: "Verify payment posted correctly", status: "pending", method: "email" }
    );
  } else if (paymentType === "paid-in-full") {
    followUps.push(
      { date: addDays(dueDate, -20).toISOString(), type: "renewal", description: "Check renewal pricing & inform", status: "pending", method: "phone" }
    );
  }
  
  return followUps;
}

function calculateTotalPayments(effectiveDate: Date, expirationDate: Date): number {
  const diffTime = Math.abs(expirationDate.getTime() - effectiveDate.getTime());
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
  return Math.max(1, diffMonths);
}

export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db('db');
    const { policyNo, dueDate, paymentType } = await request.json();
    
    // Get customer info from customer_policyandclaim_info
    const customerInfo = await db
      .collection('customer_policyandclaim_info')
      .findOne({ policy_no: policyNo });
    
    if (!customerInfo) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
    
    // FIX: Parse date without timezone conversion
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsedDueDate = new Date(year, month - 1, day, 12, 0, 0, 0);
    
    const effectiveDate = new Date(customerInfo.effective_date);
    const expirationDate = new Date(customerInfo.expiration_date);
    const totalPayments = calculateTotalPayments(effectiveDate, expirationDate);
    
    const reminderData = {
      id: customerInfo.policy_no,
      name: customerInfo.customer_name,
      dueDate: parsedDueDate.toISOString(),
      paymentDayOfMonth: parsedDueDate.getDate(),
      remainingPayments: totalPayments,
      totalPayments: totalPayments,
      status: 'active',
      paymentType: paymentType,
      phone: customerInfo.phone,
      companyName: customerInfo.company_name,
      coverageType: customerInfo.coverage_type,
      effectiveDate: customerInfo.effective_date,
      expirationDate: customerInfo.expiration_date,
      followUps: generateFollowUps(parsedDueDate, paymentType),
      createdAt: new Date().toISOString(),
    };
    
    await db.collection('payment_reminder_coll').insertOne(reminderData);
    
    return NextResponse.json({ success: true, message: 'Reminder setup successfully' });
  } catch (error) {
    console.error('Error setting up reminder:', error);
    return NextResponse.json(
      { error: 'Failed to setup reminder' },
      { status: 500 }
    );
  }
}