import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { decrypt } from '@/lib/encryption';
import { ObjectId } from 'mongodb';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  try {
    const { customerId, adminName } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    const customer = await autopayCollection.findOne({ _id: new ObjectId(customerId) });

    if (!customer) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    let decryptedData: any = {};

    if (customer.method === 'card') {
      const rawCardNumber = customer.encryptedCardNumber 
        ? decrypt(customer.encryptedCardNumber) 
        : customer.cardNumber;
      
      // Format card number with spaces every 4 digits
      const formattedCardNumber = rawCardNumber.match(/.{1,4}/g)?.join(' ') || rawCardNumber;

      decryptedData = {
        cardNumber: formattedCardNumber,
        cvv: customer.encryptedCVV ? decrypt(customer.encryptedCVV) : customer.cvv,
        cardholderName: customer.cardholderName,
        expiryMonth: customer.expiryMonth,
        expiryYear: customer.expiryYear,
        cardBrand: customer.cardBrand,
        zipCode: customer.zipCode,
      };
    } else {
      decryptedData = {
        accountNumber: customer.encryptedAccountNumber ? decrypt(customer.encryptedAccountNumber) : customer.accountNumber,
        routingNumber: customer.encryptedRoutingNumber ? decrypt(customer.encryptedRoutingNumber) : customer.routingNumber,
        accountHolderName: customer.accountHolderName,
        accountType: customer.accountType, // checking/savings
        accountHolderType: customer.accountHolderType, // personal/business - ADDED
      };
    }

    // Log the access
    await autopayCollection.updateOne(
      { _id: new ObjectId(customerId) },
      {
        $push: {
          accessLog: {
            accessedBy: adminName || 'Unknown Admin',
            accessedAt: new Date(),
            ipAddress: request.headers.get('x-forwarded-for') || 'Unknown',
            action: 'decrypt_view',
          }
        } as any
      }
    );

    return NextResponse.json({ success: true, decryptedData });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ error: 'Decryption failed' }, { status: 500 });
  }
}