import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export const dynamic = "force-dynamic";

interface Message {
  id?: string;
  subject?: string;
  creationTime?: string;
  direction?: string;
  from?: { phoneNumber?: string };
  to?: Array<{ phoneNumber?: string }>;
  readStatus?: string;
  [key: string]: unknown;
}

async function deduplicateMessages() {
  console.log("🧹 Starting AGGRESSIVE message deduplication...");
  
  const client = await connectToDatabase;
  const db = client.db("db");
  const conversationsCollection = db.collection("texas_premium_messages");

  const allConversations = await conversationsCollection.find({}).toArray();
  
  let totalRemoved = 0;
  let conversationsFixed = 0;

  for (const conversation of allConversations) {
    const messages: Message[] = conversation.messages || [];
    
    if (messages.length === 0) continue;

    console.log(`\n📱 Processing ${conversation.phoneNumber} (${messages.length} messages)`);
    
    // Sort messages by creation time first
    const sortedMessages = [...messages].sort((a, b) => {
      const timeA = new Date(a.creationTime || 0).getTime();
      const timeB = new Date(b.creationTime || 0).getTime();
      return timeA - timeB;
    });

    const uniqueMessages: Message[] = [];
    const processedSignatures = new Set<string>();
    
    for (let i = 0; i < sortedMessages.length; i++) {
      const message = sortedMessages[i];
      
      // Create multiple signatures to catch ALL types of duplicates
      const signatures: string[] = [];
      
      // Signature 1: Message ID (if exists)
      if (message.id) {
        signatures.push(`id:${message.id}`);
      }
      
      // Signature 2: Content + Exact Timestamp + Direction
      if (message.subject && message.creationTime) {
        const exactSig = `exact:${message.subject.trim().toLowerCase()}:${message.creationTime}:${message.direction}`;
        signatures.push(exactSig);
      }
      
      // Signature 3: Content + Rounded Timestamp (to nearest minute) + Direction
      // This catches duplicates that are a few seconds apart
      if (message.subject && message.creationTime) {
        const timestamp = new Date(message.creationTime).getTime();
        const roundedToMinute = Math.floor(timestamp / 60000) * 60000;
        const minuteSig = `minute:${message.subject.trim().toLowerCase()}:${roundedToMinute}:${message.direction}`;
        signatures.push(minuteSig);
      }
      
      // Signature 4: Content + Date (YYYY-MM-DD) + Direction + First 10 chars
      // This catches duplicates on same day with similar content
      if (message.subject && message.creationTime) {
        const date = new Date(message.creationTime).toISOString().split('T')[0];
        const contentStart = message.subject.trim().substring(0, 50).toLowerCase();
        const dateSig = `date:${contentStart}:${date}:${message.direction}`;
        signatures.push(dateSig);
      }
      
      // Check if this is a duplicate
      const isDuplicate = signatures.some(sig => processedSignatures.has(sig));
      
      if (isDuplicate) {
        totalRemoved++;
        console.log(`🗑️  DUPLICATE #${i}: "${message.subject?.substring(0, 50)}..." at ${message.creationTime}`);
        continue; // Skip this message
      }
      
      // Not a duplicate - add all signatures to the set
      signatures.forEach(sig => processedSignatures.add(sig));
      uniqueMessages.push(message);
    }

    // Update if we removed duplicates
    if (uniqueMessages.length < messages.length) {
      // Recalculate unread count
      const unreadCount = uniqueMessages.filter(
        (m: Message) => m.direction === "Inbound" && m.readStatus === "Unread"
      ).length;

      // Get last message info
      const lastMessage = uniqueMessages[uniqueMessages.length - 1];

      await conversationsCollection.updateOne(
        { _id: conversation._id },
        { 
          $set: { 
            messages: uniqueMessages,
            unreadCount: unreadCount,
            lastMessageTime: lastMessage?.creationTime,
            lastMessageId: lastMessage?.id
          } 
        }
      );

      conversationsFixed++;
      const removedCount = messages.length - uniqueMessages.length;
      console.log(
        `✅ FIXED ${conversation.phoneNumber}: ${messages.length} -> ${uniqueMessages.length} (removed ${removedCount})`
      );
    } else {
      console.log(`✓ ${conversation.phoneNumber}: Clean (no duplicates)`);
    }
  }

  console.log(
    `\n🎉 Deduplication complete!\n` +
    `   Total duplicates removed: ${totalRemoved}\n` +
    `   Conversations fixed: ${conversationsFixed}\n` +
    `   Total conversations: ${allConversations.length}`
  );

  return {
    success: true,
    conversationsFixed,
    duplicatesRemoved: totalRemoved,
    totalConversations: allConversations.length,
  };
}

export async function GET() {
  try {
    const result = await deduplicateMessages();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("❌ Deduplication error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await deduplicateMessages();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("❌ Deduplication error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}