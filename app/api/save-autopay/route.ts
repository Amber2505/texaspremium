import { NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { encrypt, validateCardNumber, validateRoutingNumber } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    console.log('🔵 API endpoint hit!');
    
    const body = await request.json();
    console.log('📦 Received body (method):', body.method);
    
    const { method, transactionId, customerName, customerEmail, ...paymentDetails } = body;

    // ✅ Use defaults if missing (for testing)
    const finalCustomerName = customerName || 'Test Customer';
    const finalCustomerEmail = customerEmail || 'test@example.com';

    console.log(`✅ Customer: ${finalCustomerName} (${finalCustomerEmail})`);
    console.log('🔌 Connecting to database...');
    
    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // ✅ SAVE ENCRYPTED CARD DATA
    if (method === 'card') {
      const cardNumber = paymentDetails.cardNumber.replace(/\s/g, '');
      
      // Validate card number
      if (!validateCardNumber(cardNumber)) {
        console.log('❌ Invalid card number');
        return NextResponse.json({ error: 'Invalid card number' }, { status: 400 });
      }

      console.log('💾 Encrypting and saving card autopay...');
      console.log('   Card last 4:', cardNumber.slice(-4));
      console.log('   CVV length:', paymentDetails.cvv.length);
      
      // ✅ ENCRYPT the sensitive data
      const encryptedCardNumber = encrypt(cardNumber);
      const encryptedCVV = encrypt(paymentDetails.cvv);

      console.log('🔒 Encrypted card number:', encryptedCardNumber.substring(0, 50) + '...');
      console.log('🔒 Encrypted CVV:', encryptedCVV.substring(0, 50) + '...');

      // Detect card brand
      const cardBrand = detectCardBrand(cardNumber);
      
      await autopayCollection.updateOne(
        { customerEmail: finalCustomerEmail },
        {
          $set: {
            customerName: finalCustomerName,
            customerEmail: finalCustomerEmail,
            method: 'card',
            
            // ✅ ENCRYPTED FULL DATA (only decryptable with ENCRYPTION_KEY)
            encryptedCardNumber: encryptedCardNumber,
            encryptedCVV: encryptedCVV,
            
            // Unencrypted metadata (safe to store)
            cardholderName: paymentDetails.cardholderName,
            expiryMonth: paymentDetails.expiryMonth,
            expiryYear: paymentDetails.expiryYear,
            cardLast4: cardNumber.slice(-4),
            cardBrand: cardBrand,
            
            // Timestamps
            createdAt: new Date(),
            updatedAt: new Date(),
            transactionId: transactionId || 'Unknown',
            status: 'active',
            
            // Initialize access log
            accessLog: [],
          }
        },
        { upsert: true }
      );

      console.log('✅ Card saved to MongoDB (ENCRYPTED)!');
      console.log('   Database: db');
      console.log('   Collection: autopay_customers');
      console.log('   Email key:', finalCustomerEmail);
      console.log('   Card last 4:', cardNumber.slice(-4));

      return NextResponse.json({ 
        success: true, 
        message: 'Card saved for autopay (ENCRYPTED)',
        savedData: {
          customerName: finalCustomerName,
          customerEmail: finalCustomerEmail,
          cardLast4: cardNumber.slice(-4),
          cardBrand: cardBrand,
        }
      });
    } 
    
    // ✅ SAVE ENCRYPTED BANK DATA
    else if (method === 'bank') {
      const accountNumber = paymentDetails.accountNumber.replace(/\s/g, '');
      const routingNumber = paymentDetails.routingNumber.replace(/\s/g, '');
      
      // Validate routing number
      if (!validateRoutingNumber(routingNumber)) {
        console.log('❌ Invalid routing number');
        return NextResponse.json({ error: 'Invalid routing number' }, { status: 400 });
      }

      console.log('💾 Encrypting and saving bank autopay...');
      console.log('   Account last 4:', accountNumber.slice(-4));
      
      // ✅ ENCRYPT the sensitive data
      const encryptedAccountNumber = encrypt(accountNumber);
      const encryptedRoutingNumber = encrypt(routingNumber);

      console.log('🔒 Encrypted account number:', encryptedAccountNumber.substring(0, 50) + '...');
      console.log('🔒 Encrypted routing number:', encryptedRoutingNumber.substring(0, 50) + '...');
      
      await autopayCollection.updateOne(
        { customerEmail: finalCustomerEmail },
        {
          $set: {
            customerName: finalCustomerName,
            customerEmail: finalCustomerEmail,
            method: 'bank',
            
            // ✅ ENCRYPTED FULL DATA (only decryptable with ENCRYPTION_KEY)
            encryptedAccountNumber: encryptedAccountNumber,
            encryptedRoutingNumber: encryptedRoutingNumber,
            
            // Unencrypted metadata (safe to store)
            accountHolderName: paymentDetails.accountHolderName,
            accountType: paymentDetails.accountType,
            accountLast4: accountNumber.slice(-4),
            
            // Timestamps
            createdAt: new Date(),
            updatedAt: new Date(),
            transactionId: transactionId || 'Unknown',
            status: 'active',
            
            // Initialize access log
            accessLog: [],
          }
        },
        { upsert: true }
      );

      console.log('✅ Bank account saved to MongoDB (ENCRYPTED)!');

      return NextResponse.json({ 
        success: true, 
        message: 'Bank account saved for autopay (ENCRYPTED)',
        savedData: {
          customerName: finalCustomerName,
          customerEmail: finalCustomerEmail,
          accountLast4: accountNumber.slice(-4),
          accountType: paymentDetails.accountType,
        }
      });
    }

    return NextResponse.json({ 
      error: 'Invalid method (must be "card" or "bank")' 
    }, { status: 400 });

  } catch (error) {
    console.error('❌ ERROR:', error);
    return NextResponse.json(
      { 
        error: 'Failed to set up autopay',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Helper function to detect card brand
function detectCardBrand(cardNumber: string): string {
  const patterns = {
    visa: /^4/,
    mastercard: /^5[1-5]/,
    amex: /^3[47]/,
    discover: /^6(?:011|5)/,
  };

  for (const [brand, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber)) {
      return brand;
    }
  }

  return 'unknown';
}