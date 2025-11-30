// lib/services/messageService.ts

import { getDatabase } from '@/lib/mongodb';
import { ConversationDocument, RingCentralMessage, RingCentralAttachment, MessageFilters, MessagesResponse, StatsResponse, SyncResult } from '@/lib/models/message';
import { RingCentralService } from './ringcentral';
import { azureStorage } from './azureStorage';
import { ringCentralRateLimiter } from '../rateLimiter';

/**
 * Sleep utility for delays between batches
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Type for MongoDB query filters
interface ConversationQuery {
  phoneNumber?: { $regex: string };
  'messages.subject'?: { $regex: string; $options: string };
  lastMessageTime?: {
    $gte?: string;
    $lte?: string;
  };
}

// Type for content type to extension mapping
interface ContentTypeMap {
  [key: string]: string;
}

export class MessageService {
  private collectionName = 'message_storage';
  private myPhoneNumber = '+14697295185'; // Your RingCentral number

  private async getCollection() {
    const db = await getDatabase();
    return db.collection<ConversationDocument>(this.collectionName);
  }

  // Extract the other party's phone number from a message
  private getOtherPhoneNumber(message: RingCentralMessage): string {
    if (message.direction === 'Inbound') {
      return message.from.phoneNumber;
    } else {
      return message.to[0]?.phoneNumber || '';
    }
  }

  // Deduplicate messages by ID
  private deduplicateMessages(messages: RingCentralMessage[]): RingCentralMessage[] {
    const seen = new Map<string, RingCentralMessage>();
    
    for (const message of messages) {
      if (!seen.has(message.id)) {
        seen.set(message.id, message);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Ensure we have the correct URI for downloading file content
   * RingCentral attachment URIs may need /content appended to get actual file
   */
  private ensureContentUri(attachmentUri: string): string {
    // RingCentral pattern: .../message-store/{messageId}/content/{attachmentId}
    // For actual file: .../message-store/{messageId}/content/{attachmentId}/content
    
    if (attachmentUri.endsWith('/content')) {
      return attachmentUri; // Already correct
    }
    
    // Check if URI matches pattern: .../content/{attachmentId}
    if (attachmentUri.match(/\/content\/\d+$/)) {
      const contentUri = `${attachmentUri}/content`;
      console.log(`   → Modified URI to download actual file content`);
      return contentUri;
    }
    
    return attachmentUri;
  }

  // Download attachments from RingCentral and upload to Azure (WITH RATE LIMITING AND URI FIX)
  private async processAttachments(
    message: RingCentralMessage,
    authToken: string
  ): Promise<RingCentralAttachment[]> {
    if (!message.attachments || message.attachments.length === 0) {
      return [];
    }

    const processedAttachments: RingCentralAttachment[] = [];

    // Process attachments sequentially with rate limiting
    for (const attachment of message.attachments) {
      try {
        // Check if already has Azure URL
        if (attachment.azureUrl) {
          processedAttachments.push(attachment);
          console.log(`⏭️  Attachment ${attachment.id} already processed, skipping`);
          continue;
        }

        // Extract filename from URI
        const urlParts = attachment.uri.split('/');
        const fileId = urlParts[urlParts.length - 1] || attachment.id;
        
        // Create filename with extension based on content type
        let extension = 'bin'; // default
        if (attachment.contentType) {
          const typeMap: ContentTypeMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf',
            'video/mp4': 'mp4',
            'video/quicktime': 'mov',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          };
          extension = typeMap[attachment.contentType] || extension;
        }
        
        const fileName = `${fileId}.${extension}`;
        
        console.log(`\n📎 Processing attachment:`);
        console.log(`   ID: ${attachment.id}`);
        console.log(`   File: ${fileName}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Original URI: ${attachment.uri}`);

        // Ensure we have the correct URI for downloading file content
        const downloadUri = this.ensureContentUri(attachment.uri);
        console.log(`   Download URI: ${downloadUri}`);

        // Use rate limiter to control request rate and prevent 429 errors
        const azureUrl = await ringCentralRateLimiter.execute(async () => {
          return await azureStorage.downloadAndUpload(
            downloadUri,  // Use the corrected URI
            fileName,
            attachment.contentType,
            authToken
          );
        });

        // Add Azure URL to attachment
        processedAttachments.push({
          ...attachment,
          azureUrl
        });

        console.log(`✅ Attachment saved to Azure: ${fileName}`);
        console.log(`   Azure URL: ${azureUrl}\n`);
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(`❌ Failed to process attachment ${attachment.id}:`, err.message);
        // Keep original attachment even if upload fails
        processedAttachments.push(attachment);
      }
    }

    return processedAttachments;
  }

  /**
   * Process attachments in batches to prevent overwhelming the API
   * This processes messages in smaller groups with delays between batches
   */
  private async processMessageAttachmentsBatch(
    phoneMessages: RingCentralMessage[],
    authToken: string,
    batchSize: number = 3
  ): Promise<{ messages: RingCentralMessage[], attachmentsDownloaded: number }> {
    let attachmentsDownloaded = 0;
    const updatedMessages = [...phoneMessages];
    
    // Find messages with attachments
    const messagesWithAttachments = phoneMessages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg }) => msg.attachments && msg.attachments.length > 0);

    if (messagesWithAttachments.length === 0) {
      return { messages: updatedMessages, attachmentsDownloaded: 0 };
    }

    console.log(`\n📦 Processing attachments for ${messagesWithAttachments.length} messages in batches of ${batchSize}...`);

    // Process in batches
    for (let i = 0; i < messagesWithAttachments.length; i += batchSize) {
      const batch = messagesWithAttachments.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(messagesWithAttachments.length / batchSize);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} messages with attachments)`);

      // Process all messages in the current batch
      for (const { msg, idx } of batch) {
        console.log(`📨 Message ${msg.id} has ${msg.attachments?.length || 0} attachment(s)`);
        
        const processedAttachments = await this.processAttachments(msg, authToken);
        
        // Count newly downloaded attachments
        const newDownloads = processedAttachments.filter(a => a.azureUrl).length;
        attachmentsDownloaded += newDownloads;
        
        // Update message with processed attachments
        updatedMessages[idx] = {
          ...msg,
          attachments: processedAttachments
        };
      }

      // Add delay between batches (except after the last batch)
      if (i + batchSize < messagesWithAttachments.length) {
        console.log('\n⏸️  Waiting 2 seconds before next batch...');
        await sleep(2000);
      }
    }

    console.log(`\n✅ Batch processing complete. ${attachmentsDownloaded} attachments downloaded\n`);

    return { messages: updatedMessages, attachmentsDownloaded };
  }

  async ensureIndexes(): Promise<void> {
    const collection = await this.getCollection();
    
    try {
      // Drop all old indexes (except _id which can't be dropped)
      console.log('Dropping old indexes...');
      try {
        await collection.dropIndexes();
        console.log('Old indexes dropped successfully');
      } catch (dropError: unknown) {
        const err = dropError as { codeName?: string };
        if (err.codeName !== 'NamespaceNotFound') {
          console.error('Error dropping indexes:', dropError);
        }
      }
      
      // Create new indexes for conversation structure
      console.log('Creating new indexes...');
      await collection.createIndex({ phoneNumber: 1 }, { unique: true });
      await collection.createIndex({ lastMessageTime: -1 });
      await collection.createIndex({ 'messages.subject': 'text' });
      await collection.createIndex({ 'messages.creationTime': -1 });
      console.log('New indexes created successfully');
    } catch (error) {
      console.error('Error managing indexes:', error);
    }
  }

  async syncMessages(daysBack: number = 60): Promise<SyncResult> {
    try {
      await this.ensureIndexes();
      
      const collection = await this.getCollection();
      const rcService = new RingCentralService();
      
      console.log(`Starting sync for last ${daysBack} days...`);
      
      // Get auth token for downloading attachments
      const authToken = await rcService.getAccessToken();
      
      const rawMessages = await rcService.getAllMessages(daysBack);
      
      console.log(`Fetched ${rawMessages.length} messages from RingCentral (may contain duplicates)`);
      
      // Deduplicate messages from RingCentral first
      const messages = this.deduplicateMessages(rawMessages);
      const duplicatesFromRC = rawMessages.length - messages.length;
      
      console.log(`After deduplication: ${messages.length} unique messages (removed ${duplicatesFromRC} duplicates from RingCentral)`);
      
      // Group messages by phone number
      const messagesByPhone = new Map<string, RingCentralMessage[]>();
      
      for (const message of messages) {
        const phoneNumber = this.getOtherPhoneNumber(message);
        if (!phoneNumber) continue;
        
        if (!messagesByPhone.has(phoneNumber)) {
          messagesByPhone.set(phoneNumber, []);
        }
        messagesByPhone.get(phoneNumber)!.push(message);
      }
      
      console.log(`Grouped into ${messagesByPhone.size} conversations`);
      
      let synced = 0;
      let skipped = 0;
      let conversationsUpdated = 0;
      let attachmentsDownloaded = 0;
      
      // Process each phone number's messages
      for (const [phoneNumber, phoneMessages] of messagesByPhone.entries()) {
        try {
          console.log(`\n📱 Processing conversation: ${phoneNumber}`);
          
          // Process attachments in batches with rate limiting
          const { messages: processedMessages, attachmentsDownloaded: downloaded } = 
            await this.processMessageAttachmentsBatch(phoneMessages, authToken, 3);
          
          attachmentsDownloaded += downloaded;
          
          // Sort messages by creation time
          processedMessages.sort((a, b) => 
            new Date(a.creationTime).getTime() - new Date(b.creationTime).getTime()
          );
          
          // Get existing conversation
          const existingConv = await collection.findOne({ phoneNumber });
          
          if (existingConv) {
            // Merge new messages with existing ones
            const existingIds = new Set(existingConv.messages.map(m => m.id));
            const newMessages = processedMessages.filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              const allMessages = [...existingConv.messages, ...newMessages].sort((a, b) => 
                new Date(a.creationTime).getTime() - new Date(b.creationTime).getTime()
              );
              
              await collection.updateOne(
                { phoneNumber },
                {
                  $set: {
                    messages: allMessages,
                    messageCount: allMessages.length,
                    lastMessageTime: allMessages[allMessages.length - 1].creationTime,
                    firstMessageTime: allMessages[0].creationTime,
                    lastSyncedAt: new Date(),
                  }
                }
              );
              
              synced += newMessages.length;
              conversationsUpdated++;
              console.log(`✅ Updated ${phoneNumber}: +${newMessages.length} new messages`);
            } else {
              skipped += processedMessages.length;
              console.log(`⏭️  Skipped ${phoneNumber}: All messages already exist`);
            }
          } else {
            // Create new conversation
            const newConv: ConversationDocument = {
              phoneNumber,
              myPhoneNumber: this.myPhoneNumber,
              messages: processedMessages,
              messageCount: processedMessages.length,
              firstMessageTime: processedMessages[0].creationTime,
              lastMessageTime: processedMessages[processedMessages.length - 1].creationTime,
              lastSyncedAt: new Date(),
            };
            
            await collection.insertOne(newConv);
            synced += processedMessages.length;
            conversationsUpdated++;
            console.log(`✅ Created new conversation with ${phoneNumber}: ${processedMessages.length} messages`);
          }
        } catch (error) {
          console.error(`❌ Error processing ${phoneNumber}:`, error);
          skipped += phoneMessages.length;
        }
      }
      
      console.log(`\n=== SYNC SUMMARY ===`);
      console.log(`Total from RingCentral: ${rawMessages.length} messages`);
      console.log(`Duplicates from RC: ${duplicatesFromRC} messages`);
      console.log(`Unique messages: ${messages.length} messages`);
      console.log(`New messages saved: ${synced} messages`);
      console.log(`Already in DB (skipped): ${skipped} messages`);
      console.log(`Conversations updated: ${conversationsUpdated}`);
      console.log(`Attachments downloaded to Azure: ${attachmentsDownloaded}`);
      console.log(`===================\n`);
      
      return { 
        success: true, 
        synced, 
        skipped,
        conversationsUpdated,
        attachmentsDownloaded
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('Sync failed:', error);
      return {
        success: false,
        synced: 0,
        skipped: 0,
        conversationsUpdated: 0,
        attachmentsDownloaded: 0,
        error: err.message
      };
    }
  }

  // ============================================
  // UPDATED: getMessages now supports limit=0 for fetching ALL conversations
  // ============================================
  async getMessages(filters: MessageFilters): Promise<MessagesResponse> {
    const collection = await this.getCollection();
    
    const query: ConversationQuery = {};
    
    // Phone number filter
    if (filters.phoneNumber) {
      const phoneRegex = filters.phoneNumber.replace(/\D/g, '');
      query.phoneNumber = { $regex: phoneRegex };
    }
    
    // Text search filter
    if (filters.search) {
      query['messages.subject'] = { $regex: filters.search, $options: 'i' };
    }
    
    // Date range filter
    if (filters.startDate || filters.endDate) {
      query.lastMessageTime = {};
      if (filters.startDate) {
        query.lastMessageTime.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.lastMessageTime.$lte = filters.endDate;
      }
    }
    
    const page = filters.page || 1;
    // CHANGED: Default to 0 (fetch all) instead of 50
    const limit = filters.limit ?? 0;
    
    try {
      let conversations;
      let total;
      
      // KEY FIX: If limit is 0, fetch ALL conversations (no pagination)
      if (limit === 0) {
        [conversations, total] = await Promise.all([
          collection
            .find(query)
            .sort({ lastMessageTime: -1 })
            .toArray(),
          collection.countDocuments(query),
        ]);
        console.log(`📦 Fetching ALL ${total} conversations (no limit)`);
      } else {
        // Use pagination with specified limit
        const skip = (page - 1) * limit;
        [conversations, total] = await Promise.all([
          collection
            .find(query)
            .sort({ lastMessageTime: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          collection.countDocuments(query),
        ]);
        console.log(`📦 Fetching page ${page} with limit ${limit}`);
      }
      
      // Format conversations for display
      const formattedConversations = conversations.map(conv => {
        // Type assertion for unreadCount since it may not be in the base type
        const convWithUnread = conv as ConversationDocument & { unreadCount?: number };
        return {
          phoneNumber: conv.phoneNumber,
          messageCount: conv.messageCount,
          lastMessage: conv.messages[conv.messages.length - 1],
          lastMessageTime: conv.lastMessageTime,
          unreadCount: convWithUnread.unreadCount || 0,
        };
      });
      
      return {
        conversations: formattedConversations,
        pagination: {
          page,
          limit: limit || total,
          total,
          pages: limit ? Math.ceil(total / limit) : 1,
        },
      };
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }

  async getConversation(phoneNumber: string): Promise<RingCentralMessage[]> {
    const collection = await this.getCollection();
    
    const phoneRegex = phoneNumber.replace(/\D/g, '');
    
    try {
      const conversation = await collection.findOne({
        phoneNumber: { $regex: phoneRegex }
      });
      
      return conversation?.messages || [];
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error;
    }
  }

  async getStats(): Promise<StatsResponse> {
    const collection = await this.getCollection();
    
    try {
      const allConversations = await collection.find({}).toArray();
      
      let totalMessages = 0;
      let inbound = 0;
      let outbound = 0;
      let oldestMessage: string | undefined;
      let newestMessage: string | undefined;
      
      for (const conv of allConversations) {
        totalMessages += conv.messageCount;
        
        for (const msg of conv.messages) {
          if (msg.direction === 'Inbound') inbound++;
          if (msg.direction === 'Outbound') outbound++;
          
          if (!oldestMessage || msg.creationTime < oldestMessage) {
            oldestMessage = msg.creationTime;
          }
          if (!newestMessage || msg.creationTime > newestMessage) {
            newestMessage = msg.creationTime;
          }
        }
      }
      
      return {
        totalMessages,
        totalConversations: allConversations.length,
        inbound,
        outbound,
        oldestMessage,
        newestMessage,
      };
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  async deleteOldMessages(daysToKeep: number = 365): Promise<number> {
    const collection = await this.getCollection();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffISO = cutoffDate.toISOString();
    
    try {
      const conversations = await collection.find({}).toArray();
      let deletedCount = 0;
      
      for (const conv of conversations) {
        const filteredMessages = conv.messages.filter(
          msg => msg.creationTime >= cutoffISO
        );
        
        if (filteredMessages.length === 0) {
          // Delete entire conversation if no messages left
          await collection.deleteOne({ _id: conv._id });
          deletedCount += conv.messageCount;
        } else if (filteredMessages.length < conv.messageCount) {
          // Update conversation with filtered messages
          await collection.updateOne(
            { _id: conv._id },
            {
              $set: {
                messages: filteredMessages,
                messageCount: filteredMessages.length,
                firstMessageTime: filteredMessages[0].creationTime,
              }
            }
          );
          deletedCount += (conv.messageCount - filteredMessages.length);
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error deleting old messages:', error);
      throw error;
    }
  }
}