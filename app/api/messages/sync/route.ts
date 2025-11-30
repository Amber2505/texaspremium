import { NextRequest, NextResponse } from 'next/server';
import { MessageService } from '@/lib/services/messageService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack || 7;
    
    console.log(`Starting sync for last ${daysBack} days...`);
    
    const messageService = new MessageService();
    const result = await messageService.syncMessages(daysBack);
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Sync error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { 
        success: false, 
        synced: 0,
        skipped: 0,
        conversationsUpdated: 0,
        error: err.message 
      },
      { status: 500 }
    );
  }
}