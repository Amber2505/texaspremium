import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";

// Type for stored message
interface StoredMessage {
  id?: string;
  subject?: string;
  direction?: string;
  readStatus?: string;
}

// Type for conversation document
interface ConversationDocument {
  phoneNumber: string;
  conversationId?: string;
  participants?: string[];
  isGroup?: boolean;
  messages?: StoredMessage[];
}

// Helper function to normalize phone numbers
function normalizePhone(phone: string): string {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

// Normalize a conversationId (which may contain multiple phones for groups)
function normalizeConversationId(convId: string): string {
  if (!convId) return convId;
  if (convId.includes(',')) {
    return convId.split(',').map(p => normalizePhone(p.trim())).sort().join(',');
  }
  return normalizePhone(convId);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phoneNumber = searchParams.get('phoneNumber');
    const conversationId = searchParams.get('conversationId');
    const fetchAll = searchParams.get('all') === 'true';
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const limit = fetchAll ? 10000 : parseInt(searchParams.get('limit') || '10', 10);
    const searchText = searchParams.get('searchText') || '';
    
    if (!phoneNumber && !conversationId) {
      return NextResponse.json(
        { error: 'Phone number or conversation ID is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");
    
    // Normalize the input for matching
    const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : null;
    const normalizedConvId = conversationId ? normalizeConversationId(conversationId) : null;
    
    console.log(`🔍 Fetching conversation:`);
    console.log(`   Raw: conversationId=${conversationId}, phoneNumber=${phoneNumber}`);
    console.log(`   Normalized: convId=${normalizedConvId}, phone=${normalizedPhone}`);
    console.log(`   skip: ${skip}, limit: ${limit}, searchText: ${searchText || 'none'}`);
    
    // Build a comprehensive query to find the conversation
    // This handles various scenarios:
    // 1. New format with conversationId field
    // 2. Old format with only phoneNumber field
    // 3. Phone number format variations
    let conversation: ConversationDocument | null = null;
    
    // Try multiple lookup strategies
    const lookupValue = normalizedConvId || normalizedPhone;
    const rawValue = conversationId || phoneNumber;
    
    if (lookupValue) {
      // Strategy 1: Direct match on conversationId (normalized)
      conversation = await conversationsCollection.findOne({
        conversationId: lookupValue,
      }) as ConversationDocument | null;
      
      if (conversation) {
        console.log(`   ✅ Found by conversationId (normalized): ${lookupValue}`);
      }
      
      // Strategy 2: Direct match on conversationId (raw value)
      if (!conversation && rawValue !== lookupValue) {
        conversation = await conversationsCollection.findOne({
          conversationId: rawValue,
        }) as ConversationDocument | null;
        
        if (conversation) {
          console.log(`   ✅ Found by conversationId (raw): ${rawValue}`);
        }
      }
      
      // Strategy 3: Match on phoneNumber field (normalized)
      if (!conversation) {
        conversation = await conversationsCollection.findOne({
          phoneNumber: lookupValue,
        }) as ConversationDocument | null;
        
        if (conversation) {
          console.log(`   ✅ Found by phoneNumber (normalized): ${lookupValue}`);
        }
      }
      
      // Strategy 4: Match on phoneNumber field (raw value)
      if (!conversation && rawValue !== lookupValue) {
        conversation = await conversationsCollection.findOne({
          phoneNumber: rawValue,
        }) as ConversationDocument | null;
        
        if (conversation) {
          console.log(`   ✅ Found by phoneNumber (raw): ${rawValue}`);
        }
      }
      
      // Strategy 5: Check if the value is in participants array
      if (!conversation) {
        conversation = await conversationsCollection.findOne({
          participants: { $in: [lookupValue, rawValue].filter(Boolean) },
        }) as ConversationDocument | null;
        
        if (conversation) {
          console.log(`   ✅ Found by participants array`);
        }
      }
      
      // Strategy 6: Regex match for phone variations (last resort)
      if (!conversation && normalizedPhone) {
        const digits = normalizedPhone.replace(/\D/g, '');
        const last10 = digits.slice(-10);
        
        conversation = await conversationsCollection.findOne({
          $or: [
            { phoneNumber: { $regex: last10 } },
            { conversationId: { $regex: last10 } },
          ]
        }) as ConversationDocument | null;
        
        if (conversation) {
          console.log(`   ✅ Found by regex match on last 10 digits: ${last10}`);
        }
      }
    }
    
    if (!conversation) {
      console.log(`   ❌ No conversation found for: ${rawValue}`);
      return NextResponse.json({
        messages: [],
        total: 0,
        skip,
        limit,
        hasMore: false,
        searchText,
        matchingIndices: [],
        conversationId: conversationId || phoneNumber,
        isGroup: false,
        participants: phoneNumber ? [phoneNumber] : [],
        notFound: true,
      });
    }
    
    const allMessages = conversation.messages || [];
    
    // Deduplicate messages by ID
    const seenIds = new Set<string>();
    const uniqueMessages = allMessages.filter((msg: StoredMessage) => {
      if (!msg.id) return true;
      if (seenIds.has(msg.id)) {
        console.log(`   ⚠️ Duplicate message removed: ${msg.id}`);
        return false;
      }
      seenIds.add(msg.id);
      return true;
    });
    
    const total = uniqueMessages.length;
    const isGroup = conversation.isGroup || false;
    const participants = conversation.participants || 
                        (conversation.conversationId ? conversation.conversationId.split(',') : 
                        [conversation.phoneNumber || phoneNumber || '']);
    
    const duplicatesRemoved = allMessages.length - total;
    if (duplicatesRemoved > 0) {
      console.log(`   📊 Removed ${duplicatesRemoved} duplicate messages`);
    }
    console.log(`   📊 Total: ${total} messages, Group: ${isGroup}, Participants: [${participants.join(', ')}]`);
    
    // Text search logic
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      
      const matchingIndices: number[] = [];
      uniqueMessages.forEach((msg: StoredMessage, index: number) => {
        if (msg.subject && msg.subject.toLowerCase().includes(searchLower)) {
          matchingIndices.push(index);
        }
      });
      
      if (matchingIndices.length === 0) {
        const startIndex = Math.max(0, total - limit);
        const messages = uniqueMessages.slice(startIndex, total);
        return NextResponse.json({
          messages,
          total,
          skip: 0,
          limit,
          hasMore: startIndex > 0,
          searchText,
          matchingIndices: [],
          firstMatchIndex: -1,
          conversationId: conversation.conversationId || conversation.phoneNumber,
          isGroup,
          participants,
        });
      }
      
      const firstMatchIndex = matchingIndices[0];
      const contextBefore = 5;
      const contextAfter = 5;
      const startIndex = Math.max(0, firstMatchIndex - contextBefore);
      const endIndex = Math.min(total, firstMatchIndex + contextAfter + 1);
      
      const messages = uniqueMessages.slice(startIndex, endIndex);
      
      const relativeMatchingIndices = matchingIndices
        .filter(idx => idx >= startIndex && idx < endIndex)
        .map(idx => idx - startIndex);
      
      console.log(`   ✅ Search "${searchText}": ${matchingIndices.length} matches, returning ${messages.length} messages`);
      
      return NextResponse.json({
        messages,
        total,
        skip: startIndex,
        limit: messages.length,
        hasMore: startIndex > 0,
        hasMoreAfter: endIndex < total,
        searchText,
        matchingIndices: relativeMatchingIndices,
        firstMatchIndex: relativeMatchingIndices[0] || 0,
        absoluteFirstMatch: firstMatchIndex,
        conversationId: conversation.conversationId || conversation.phoneNumber,
        isGroup,
        participants,
      });
    }
    
    // Fetch all
    if (fetchAll) {
      return NextResponse.json({
        messages: uniqueMessages,
        total,
        skip: 0,
        limit: total,
        hasMore: false,
        searchText: '',
        matchingIndices: [],
        conversationId: conversation.conversationId || conversation.phoneNumber,
        isGroup,
        participants,
      });
    }
    
    // Normal pagination
    const startIndex = Math.max(0, total - skip - limit);
    const endIndex = total - skip;
    const messages = uniqueMessages.slice(startIndex, endIndex);
    const hasMore = startIndex > 0;
    
    console.log(`   ✅ Returning ${messages.length}/${total} messages (indices ${startIndex}-${endIndex}, hasMore: ${hasMore})`);
    
    return NextResponse.json({
      messages,
      total,
      skip,
      limit,
      hasMore,
      searchText: '',
      matchingIndices: [],
      conversationId: conversation.conversationId || conversation.phoneNumber,
      isGroup,
      participants,
    });
  } catch (error: unknown) {
    console.error('❌ Get conversation error:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}