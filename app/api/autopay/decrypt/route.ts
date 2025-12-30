import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { decrypt } from '@/lib/encryption';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerEmail, adminName } = body;

    if (!customerEmail) {
      return NextResponse.json({ error: 'Customer email required' }, { status: 400 });
    }

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // Find customer
    const customer = await autopayCollection.findOne({ customerEmail });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    let decryptedData: Record<string, string> = {};

    // ✅ HANDLE BOTH TEST MODE (unencrypted) AND PRODUCTION MODE (encrypted)
    if (customer.method === 'card') {
      try {
        // Check if data is encrypted or plain (TEST mode)
        if (customer.encryptedCardNumber) {
          // PRODUCTION MODE: Decrypt encrypted data
          decryptedData = {
            cardNumber: decrypt(customer.encryptedCardNumber),
            cvv: decrypt(customer.encryptedCVV),
            cardholderName: customer.cardholderName,
            expiryMonth: customer.expiryMonth,
            expiryYear: customer.expiryYear,
            cardBrand: customer.cardBrand,
          };
          console.log('🔓 Decrypted card data (PRODUCTION MODE)');
        } else if (customer.cardNumber) {
          // TEST MODE: Data already unencrypted
          decryptedData = {
            cardNumber: customer.cardNumber,
            cvv: customer.cvv,
            cardholderName: customer.cardholderName,
            expiryMonth: customer.expiryMonth,
            expiryYear: customer.expiryYear,
            cardBrand: customer.cardBrand || 'unknown',
          };
          console.log('⚠️ Showing unencrypted card data (TEST MODE)');
        } else {
          return NextResponse.json({ error: 'No card data found' }, { status: 404 });
        }
      } catch (error) {
        console.error('Decryption error:', error);
        return NextResponse.json({ error: 'Failed to decrypt card data' }, { status: 500 });
      }
    }
    // Bank data
    else if (customer.method === 'bank') {
      try {
        // Check if data is encrypted or plain (TEST mode)
        if (customer.encryptedAccountNumber) {
          // PRODUCTION MODE: Decrypt encrypted data
          decryptedData = {
            accountNumber: decrypt(customer.encryptedAccountNumber),
            routingNumber: decrypt(customer.encryptedRoutingNumber),
            accountHolderName: customer.accountHolderName,
            accountType: customer.accountType,
          };
          console.log('🔓 Decrypted bank data (PRODUCTION MODE)');
        } else if (customer.accountNumber) {
          // TEST MODE: Data already unencrypted
          decryptedData = {
            accountNumber: customer.accountNumber,
            routingNumber: customer.routingNumber,
            accountHolderName: customer.accountHolderName,
            accountType: customer.accountType,
          };
          console.log('⚠️ Showing unencrypted bank data (TEST MODE)');
        } else {
          return NextResponse.json({ error: 'No bank data found' }, { status: 404 });
        }
      } catch (error) {
        console.error('Decryption error:', error);
        return NextResponse.json({ error: 'Failed to decrypt bank data' }, { status: 500 });
      }
    }

    // ✅ Log access
    await autopayCollection.updateOne(
      { customerEmail },
      {
        $push: {
          accessLog: {
            accessedBy: adminName || 'Unknown Admin',
            accessedAt: new Date(),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown',
            action: 'decrypt_view',
          }
        } as any
      }
    );

    console.log(`🔓 Admin "${adminName}" accessed autopay data for ${customerEmail}`);

    return NextResponse.json({
      success: true,
      customer: {
        name: customer.customerName,
        email: customer.customerEmail,
        method: customer.method,
        status: customer.status,
        createdAt: customer.createdAt,
        transactionId: customer.transactionId,
      },
      decryptedData,
      warning: '⚠️ This is sensitive data. Handle with care and never share.',
    });

  } catch (error) {
    console.error('❌ Decrypt error:', error);
    return NextResponse.json(
      { error: 'Failed to decrypt data' },
      { status: 500 }
    );
  }
}