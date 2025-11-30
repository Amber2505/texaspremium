import { NextRequest, NextResponse } from 'next/server';
import { MessageService } from '@/lib/services/messageService';
import connectToDatabase from '@/lib/mongodb';

// Collection to track sync metadata
const SYNC_META_COLLECTION = 'sync_metadata';
const SYNC_DOC_ID = 'daily-sync';

interface SyncMetadata {
  docId: string;
  lastSuccessfulSync: Date;
  lastAttempt: Date;
  consecutiveFailures: number;
}

async function getLastSyncTime(): Promise<Date | null> {
  try {
    const client = await connectToDatabase;
    const db = client.db('db');
    const collection = db.collection<SyncMetadata>(SYNC_META_COLLECTION);
    
    const doc = await collection.findOne({ docId: SYNC_DOC_ID });
    return doc?.lastSuccessfulSync || null;
  } catch (error) {
    console.error('Failed to get last sync time:', error);
    return null;
  }
}

async function updateSyncMetadata(success: boolean): Promise<void> {
  try {
    const client = await connectToDatabase;
    const db = client.db('db');
    const collection = db.collection(SYNC_META_COLLECTION);
    
    const now = new Date();
    
    if (success) {
      await collection.updateOne(
        { docId: SYNC_DOC_ID },
        {
          $set: {
            lastSuccessfulSync: now,
            lastAttempt: now,
            consecutiveFailures: 0,
          },
        },
        { upsert: true }
      );
    } else {
      await collection.updateOne(
        { docId: SYNC_DOC_ID },
        {
          $set: { lastAttempt: now },
          $inc: { consecutiveFailures: 1 },
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error('Failed to update sync metadata:', error);
  }
}

function calculateDaysToSync(lastSync: Date | null): number {
  if (!lastSync) {
    // First time or no record - sync last 7 days
    console.log('📅 No previous sync found, syncing last 7 days');
    return 7;
  }
  
  const now = new Date();
  const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
  const daysSinceLastSync = Math.ceil(hoursSinceLastSync / 24);
  
  console.log(`📅 Last successful sync: ${lastSync.toISOString()}`);
  console.log(`📅 Hours since last sync: ${hoursSinceLastSync.toFixed(1)}`);
  
  // Add 1 day buffer for safety, cap at 30 days max
  const daysToSync = Math.min(Math.max(daysSinceLastSync + 1, 1), 30);
  
  console.log(`📅 Will sync last ${daysToSync} days`);
  return daysToSync;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔄 Starting daily sync cron job...');
    
    // Get last sync time and calculate days to sync
    const lastSyncTime = await getLastSyncTime();
    const daysToSync = calculateDaysToSync(lastSyncTime);
    
    const messageService = new MessageService();
    const result = await messageService.syncMessages(daysToSync);
    
    // Mark sync as successful
    await updateSyncMetadata(true);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Daily sync completed in ${duration}ms`);
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      durationMs: duration,
      daysChecked: daysToSync,
      lastSyncTime: lastSyncTime?.toISOString() || null,
      ...result,
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error('❌ Cron sync error:', error);
    
    // Mark sync as failed
    await updateSyncMetadata(false);
    
    const err = error as { message?: string };
    return NextResponse.json(
      { 
        success: false, 
        synced: 0,
        skipped: 0,
        error: err.message,
        timestamp: new Date().toISOString(),
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}