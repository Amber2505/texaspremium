import { NextResponse } from "next/server";

interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
}

interface SampleConversation {
  phoneNumber: string;
  messageCount: number;
  unreadCount: number;
  hasMessages: boolean;
  firstMessageId: string | undefined;
  firstMessageReadStatus: string | undefined;
}

// Type for database list item
interface DatabaseListItem {
  name: string;
  sizeOnDisk?: number;
}

// Type for collection list item
interface CollectionListItem {
  name: string;
}

// Quick check to see which database and collection we're using
export async function GET() {
  try {
    const connectToDatabase = (await import("@/lib/mongodb")).default;
    const client = await connectToDatabase;
    
    // List all databases
    const adminDb = client.db().admin();
    const dbList = await adminDb.listDatabases();
    
    const databases: DatabaseInfo[] = dbList.databases.map((db: DatabaseListItem) => ({
      name: db.name,
      sizeOnDisk: db.sizeOnDisk || 0,
    }));
    
    console.log("📊 All databases:", databases.map((db) => db.name));
    
    // Check the "db" database
    const db = client.db("db");
    const collectionsArray = await db.listCollections().toArray();
    
    const collections: string[] = collectionsArray.map((c: CollectionListItem) => c.name);
    
    console.log("📁 Collections in 'db' database:", collections);
    
    // Count documents in texas_premium_messages
    const conversationsCollection = db.collection("texas_premium_messages");
    const count = await conversationsCollection.countDocuments();
    
    // Get sample conversation
    const sampleDoc = await conversationsCollection.findOne({});
    
    let sampleConversation: SampleConversation | null = null;
    
    if (sampleDoc) {
      const messages = sampleDoc.messages || [];
      sampleConversation = {
        phoneNumber: sampleDoc.phoneNumber || "Unknown",
        messageCount: messages.length,
        unreadCount: sampleDoc.unreadCount || 0,
        hasMessages: messages.length > 0,
        firstMessageId: messages[0]?.id,
        firstMessageReadStatus: messages[0]?.readStatus,
      };
    }
    
    return NextResponse.json({
      allDatabases: databases,
      currentDatabase: "db",
      collectionsInDb: collections,
      texasPremiumMessagesCount: count,
      sampleConversation: sampleConversation,
    });
  } catch (error: unknown) {
    console.error("❌ Database check error:", error);
    const err = error as { message?: string; stack?: string };
    return NextResponse.json(
      { 
        error: err.message,
        stack: err.stack 
      },
      { status: 500 }
    );
  }
}