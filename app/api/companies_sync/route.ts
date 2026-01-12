/* eslint-disable @typescript-eslint/no-unused-vars */
import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

const uri = process.env.MONGODB_URI!;

export async function POST() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('db');

    // 1. Get all unique company names from the policy info collection
    const policyCompanies = await db
      .collection('customer_policyandclaim_info')
      .distinct('company_name');

    // 2. Get all company names already in your links database
    const existingCompanies = await db
      .collection('company_database')
      .distinct('name');

    const existingSet = new Set(existingCompanies);

    // 3. Filter for names that are in policies but NOT in the links database
    const newNames = policyCompanies.filter(
      (name) => name && name.trim() !== '' && !existingSet.has(name)
    );

    if (newNames.length > 0) {
      const docsToInsert = newNames.map((name) => ({
        name: name,
        paymentLink: '',
        claimLink: '',
        claimPhone: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.collection('company_database').insertMany(docsToInsert);
    }

    return NextResponse.json({ 
      success: true, 
      addedCount: newNames.length, 
      newCompanies: newNames 
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  } finally {
    await client.close();
  }
}