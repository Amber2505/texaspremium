// lib/models/message.ts 

export interface RingCentralContact {
  phoneNumber: string;
  name?: string;
  location?: string;
}

export interface RingCentralAttachment {
  id: string;
  uri: string; // Original RingCentral URL (requires auth)
  type: string;
  contentType: string;
  azureUrl?: string; // Public Azure URL (no auth needed)
}

export interface RingCentralMessage {
  id: string;
  uri: string;
  type: string;
  direction: 'Inbound' | 'Outbound';
  from: RingCentralContact;
  to: RingCentralContact[];
  subject: string;
  creationTime: string;
  lastModifiedTime: string;
  readStatus: 'Read' | 'Unread';
  messageStatus: string;
  conversationId?: string;
  availability?: string;
  attachments?: RingCentralAttachment[];
}

// Conversation document structure
export interface ConversationDocument {
  _id?: string;
  phoneNumber: string; // The other party's phone number
  myPhoneNumber: string; // Your RingCentral number
  messageCount: number;
  firstMessageTime: string;
  lastMessageTime: string;
  lastSyncedAt: Date;
  messages: RingCentralMessage[];
}

export interface MessageFilters {
  phoneNumber?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  direction?: 'Inbound' | 'Outbound';
  page?: number;
  limit?: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface MessagesResponse {
  conversations: Array<{
    phoneNumber: string;
    messageCount: number;
    lastMessage: RingCentralMessage;
    lastMessageTime: string;
  }>;
  pagination: PaginationInfo;
}

export interface StatsResponse {
  totalMessages: number;
  totalConversations: number;
  inbound: number;
  outbound: number;
  oldestMessage?: string;
  newestMessage?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  conversationsUpdated: number;
  attachmentsDownloaded?: number;
  error?: string;
}