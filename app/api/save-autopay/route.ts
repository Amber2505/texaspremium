import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { encrypt, validateCardNumber, validateRoutingNumber } from '@/lib/encryption';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const { 
      method, 
      customerName, 
      customerPhone,
      ...paymentDetails 
    } = body;

    // Validation: Ensure we have a name and a phone number
    if (!customerName || !customerPhone) {
      return NextResponse.json(
        { error: 'Customer Name and Phone Number are required' }, 
        { status: 400 }
      );
    }

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // Prepare the base record
    let recordToSave: any = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.replace(/\D/g, ''),
      method: method,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      accessLog: []
    };

    // Handle Card Logic
    if (method === 'card') {
      const cardNumber = paymentDetails.cardNumber.replace(/\s/g, '');
      if (!validateCardNumber(cardNumber)) {
        return NextResponse.json({ error: 'Invalid card number' }, { status: 400 });
      }

      recordToSave = {
        ...recordToSave,
        encryptedCardNumber: encrypt(cardNumber),
        encryptedCVV: encrypt(paymentDetails.cvv),
        cardholderName: paymentDetails.cardholderName,
        expiryMonth: paymentDetails.expiryMonth,
        expiryYear: paymentDetails.expiryYear,
        zipCode: paymentDetails.zipCode,
        cardLast4: cardNumber.slice(-4),
        cardBrand: detectCardBrand(cardNumber),
      };
    } 
    // Handle Bank Logic
    else if (method === 'bank') {
      const accountNumber = paymentDetails.accountNumber.replace(/\s/g, '');
      const routingNumber = paymentDetails.routingNumber.replace(/\s/g, '');

      if (!validateRoutingNumber(routingNumber)) {
        return NextResponse.json({ error: 'Invalid routing number' }, { status: 400 });
      }

      recordToSave = {
        ...recordToSave,
        encryptedAccountNumber: encrypt(accountNumber),
        encryptedRoutingNumber: encrypt(routingNumber),
        accountHolderName: paymentDetails.accountHolderName,
        accountType: paymentDetails.accountType, // checking/savings
        accountHolderType: paymentDetails.accountHolderType, // personal/business - ADDED
        accountLast4: accountNumber.slice(-4),
      };
    } else {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
    }

    // Insert new record
    const result = await autopayCollection.insertOne(recordToSave);

    return NextResponse.json({ 
      success: true, 
      id: result.insertedId,
      message: 'Autopay information saved successfully.' 
    });

  } catch (error) {
    console.error('❌ Save Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function detectCardBrand(cardNumber: string): string {
  const patterns = {
    visa: /^4/,
    mastercard: /^5[1-5]/,
    amex: /^3[47]/,
    discover: /^6(?:011|5)/,
  };
  for (const [brand, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber)) return brand;
  }
  return 'unknown';
}