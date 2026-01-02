import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from 'mongodb';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid customer ID format' },
        { status: 400 }
      );
    }

    const client_db = await connectToDatabase;
    const db = client_db.db("db");
    const autopayCollection = db.collection("autopay_customers");

    // Delete the record
    const result = await autopayCollection.deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Autopay record deleted successfully',
      deletedId: id
    });

  } catch (error) {
    console.error('❌ Delete Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete record' },
      { status: 500 }
    );
  }
}