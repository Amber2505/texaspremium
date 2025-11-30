const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const express = require('express');
const cron = require('node-cron');

const httpServer = createServer();
const app = express();
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://www.texaspremiumins.com",
      "https://texaspremium-git-main-amber2505s-projects.vercel.app",
      "https://texaspremium-elczh28e2-amber2505s-projects.vercel.app",
      "https://texaspremium-production.up.railway.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 120000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// ================================================
// REAL-TIME RINGCENTRAL NOTIFICATION ENDPOINT
// ================================================
app.post('/notify/ringcentral', (req, res) => {
  try {
    const { phoneNumber, messageId, timestamp, subject } = req.body;

    if (!phoneNumber) {
      console.warn('Missing phoneNumber in /notify/ringcentral');
      return res.status(400).json({ error: "Missing phoneNumber" });
    }

    console.log(`New RingCentral message → broadcasting to conversation:${phoneNumber}`);

    io.to(`conversation:${phoneNumber}`).emit('newRingCentralMessage', {
      phoneNumber,
      messageId,
      timestamp,
      subject: subject || "New message",
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /notify/ringcentral:', error);
    res.status(500).json({ error: "Internal error" });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    lastSync: lastSyncTime,
    nextSync: nextSyncTime
  });
});

// Manual sync trigger endpoint
app.post('/trigger-sync', async (req, res) => {
  try {
    console.log('📱 Manual sync triggered via HTTP');
    const result = await syncRingCentralMessages();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Attach Express app to the same HTTP server
httpServer.on('request', app);

// ================================================
// MONGODB CONNECTION
// ================================================
let db;
let liveChatHistoryCollection;
let deletedChatsCollection;
let mongoClient = null;

// For RingCentral sync
let messagesDb;
let conversationsCollection;

async function connectMongoDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    console.log('Attempting to connect to MongoDB...');
    
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    await mongoClient.connect();
    await mongoClient.db().admin().ping();
    console.log('MongoDB ping successful');
    
    // Live chat database
    db = mongoClient.db('myFirstDatabase');
    liveChatHistoryCollection = db.collection('live_chat_history');
    deletedChatsCollection = db.collection('deleted_chats_history');
    
    // RingCentral messages database
    messagesDb = mongoClient.db('db');
    conversationsCollection = messagesDb.collection('texas_premium_messages');
    
    const count = await liveChatHistoryCollection.countDocuments();
    console.log(`MongoDB connected successfully. Found ${count} existing chat records.`);
    
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.error('Stack:', error.stack);
    db = null;
    liveChatHistoryCollection = null;
    deletedChatsCollection = null;
    messagesDb = null;
    conversationsCollection = null;
    return false;
  }
}

// ================================================
// RINGCENTRAL SYNC FUNCTION
// ================================================
const MY_PHONE_NUMBER = process.env.MY_PHONE_NUMBER || '+14697295185';
let lastSyncTime = null;
let nextSyncTime = null;

async function getRingCentralPlatform() {
  const SDK = require('@ringcentral/sdk').SDK;
  
  const rcsdk = new SDK({
    server: process.env.RINGCENTRAL_SERVER || 'https://platform.ringcentral.com',
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  return platform;
}

async function syncRingCentralMessages() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`\n🔄 [${timestamp}] Starting RingCentral sync...`);

  if (!conversationsCollection) {
    console.error('❌ MongoDB not connected, skipping sync');
    return { success: false, error: 'Database not connected' };
  }

  // Check required env vars
  const requiredVars = ['RINGCENTRAL_CLIENT_ID', 'RINGCENTRAL_CLIENT_SECRET', 'RINGCENTRAL_JWT'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing RingCentral env vars: ${missingVars.join(', ')}`);
    return { success: false, error: `Missing env vars: ${missingVars.join(', ')}` };
  }

  try {
    const platform = await getRingCentralPlatform();

    // Fetch messages from last 60 minutes
    const dateFrom = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const response = await platform.get('/restapi/v1.0/account/~/extension/~/message-store', {
      messageType: 'SMS',
      dateFrom: dateFrom,
      perPage: 100,
    });

    const data = await response.json();
    const messages = data.records || [];

    console.log(`📥 Found ${messages.length} messages from RingCentral`);

    let synced = 0;
    let skipped = 0;

    for (const msg of messages) {
      // Determine the other party's phone number
      const isOutbound = msg.direction === 'Outbound';
      const otherPhone = isOutbound 
        ? msg.to?.[0]?.phoneNumber 
        : msg.from?.phoneNumber;

      if (!otherPhone) {
        skipped++;
        continue;
      }

      // Check if message already exists
      const existingConv = await conversationsCollection.findOne({
        phoneNumber: otherPhone,
        'messages.id': msg.id.toString(),
      });

      if (existingConv) {
        skipped++;
        continue;
      }

      // Prepare message object
      const messageObj = {
        id: msg.id.toString(),
        direction: msg.direction,
        type: msg.type,
        subject: msg.subject || '',
        creationTime: msg.creationTime,
        lastModifiedTime: msg.lastModifiedTime,
        readStatus: msg.direction === 'Inbound' ? 'Unread' : 'Read',
        messageStatus: msg.messageStatus,
        from: msg.from,
        to: msg.to,
        attachments: [], // Skip attachments for Railway sync (handled by Vercel)
      };

      // Build update operation
      const updateOperation = {
        $push: {
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 },
          },
        },
        $set: {
          lastMessageTime: msg.creationTime,
          lastMessageId: msg.id.toString(),
        },
      };

      // Add unread increment for inbound messages
      if (msg.direction === 'Inbound') {
        updateOperation.$inc = { unreadCount: 1 };
      }

      await conversationsCollection.updateOne(
        { phoneNumber: otherPhone },
        updateOperation,
        { upsert: true }
      );

      synced++;
      
      // Broadcast new message to any connected admins viewing this conversation
      io.to(`conversation:${otherPhone}`).emit('newRingCentralMessage', {
        phoneNumber: otherPhone,
        messageId: msg.id.toString(),
        timestamp: msg.creationTime,
        subject: msg.subject || '',
        direction: msg.direction,
      });
    }

    // Two-way read status sync
    let readStatusSynced = 0;
    
    try {
      const allConversations = await conversationsCollection.find({}).toArray();
      const unreadMessageMap = new Map();

      for (const conversation of allConversations) {
        const phoneNumber = conversation.phoneNumber;
        const conversationMessages = conversation.messages || [];

        const unreadInbound = conversationMessages.filter(
          (m) => m.direction === 'Inbound' && m.readStatus === 'Unread' && m.id
        );

        unreadInbound.forEach((m) => {
          unreadMessageMap.set(m.id, { phoneNumber, messageId: m.id });
        });
      }

      if (unreadMessageMap.size > 0) {
        const readResponse = await platform.get(
          '/restapi/v1.0/account/~/extension/~/message-store',
          {
            messageType: 'SMS',
            readStatus: 'Read',
            perPage: 1000,
          }
        );

        const rcReadMessages = (await readResponse.json()).records || [];
        const conversationsToUpdate = new Set();

        for (const rcMessage of rcReadMessages) {
          const messageId = rcMessage.id.toString();

          if (unreadMessageMap.has(messageId)) {
            const { phoneNumber } = unreadMessageMap.get(messageId);

            await conversationsCollection.updateOne(
              { phoneNumber, 'messages.id': messageId },
              { $set: { 'messages.$.readStatus': 'Read' } }
            );

            conversationsToUpdate.add(phoneNumber);
            readStatusSynced++;
          }
        }

        // Recalculate unread counts
        for (const phoneNumber of conversationsToUpdate) {
          const conversation = await conversationsCollection.findOne({ phoneNumber });
          
          if (conversation) {
            const newUnreadCount = (conversation.messages || []).filter(
              (m) => m.direction === 'Inbound' && m.readStatus === 'Unread'
            ).length;

            await conversationsCollection.updateOne(
              { phoneNumber },
              { $set: { unreadCount: newUnreadCount } }
            );
          }
        }
      }
    } catch (readSyncError) {
      console.error('❌ Read status sync error:', readSyncError.message);
    }

    const duration = Date.now() - startTime;
    lastSyncTime = new Date().toISOString();
    
    console.log(`✅ Sync completed in ${duration}ms:`);
    console.log(`   - Synced: ${synced} messages`);
    console.log(`   - Skipped: ${skipped} messages`);
    console.log(`   - Read status synced: ${readStatusSynced}`);

    return { success: true, synced, skipped, readStatusSynced, durationMs: duration };

  } catch (error) {
    console.error(`❌ Sync error:`, error.message);
    return { success: false, error: error.message };
  }
}

// ================================================
// START SERVER & CRON
// ================================================
async function startServer() {
  const dbConnected = await connectMongoDB();
  
  if (!dbConnected) {
    console.error('Server starting WITHOUT database connection');
    console.error('Chat history and sync features will not work');
  }

  // Setup cron job for RingCentral sync
  const syncSchedule = process.env.SYNC_SCHEDULE || '*/1 * * * *'; // Default: every 1 minute
  
  // Check if RingCentral is configured
  const rcConfigured = process.env.RINGCENTRAL_CLIENT_ID && 
                       process.env.RINGCENTRAL_CLIENT_SECRET && 
                       process.env.RINGCENTRAL_JWT;

  if (rcConfigured) {
    console.log(`\n📅 RingCentral Sync Schedule: ${syncSchedule}`);
    
    // Run initial sync after 10 seconds (let server stabilize)
    setTimeout(() => {
      console.log('🚀 Running initial RingCentral sync...');
      syncRingCentralMessages();
    }, 10000);

    // Schedule recurring syncs
    cron.schedule(syncSchedule, () => {
      syncRingCentralMessages();
    });

    // Calculate next sync time for health check
    const updateNextSyncTime = () => {
      const now = new Date();
      now.setSeconds(0);
      now.setMilliseconds(0);
      now.setMinutes(now.getMinutes() + 1);
      nextSyncTime = now.toISOString();
    };
    updateNextSyncTime();
    setInterval(updateNextSyncTime, 60000);

    console.log('✅ RingCentral sync cron scheduled\n');
  } else {
    console.log('\n⚠️  RingCentral not configured - sync disabled');
    console.log('   Set RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT to enable\n');
  }
}

startServer();

// ================================================
// SOCKET.IO HANDLERS (unchanged from original)
// ================================================
const activeSessions = new Map();
const adminSockets = new Set();
const agentWaitTimers = new Map();

// Send SMS notification when no agent connects
async function sendNoAgentNotification(session) {
  try {
    const message = `URGENT: Customer ${session.userName} (${session.userPhone}) has been waiting for 5 minutes without an agent response. Live chat needs attention!`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = '+19727486404';
    const smsUrl = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;
    
    await fetch(smsUrl);
    console.log('Sent no-agent notification SMS for:', session.userName);
  } catch (error) {
    console.error('Failed to send SMS notification:', error);
  }
}

// Save chat history to MongoDB
async function saveChatHistory(session) {
  if (!liveChatHistoryCollection) return;
  
  try {
    await liveChatHistoryCollection.updateOne(
      { userId: session.userId },
      {
        $set: {
          userId: session.userId,
          userName: session.userName,
          userPhone: session.userPhone,
          conversationHistory: session.conversationHistory,
          hasAgent: session.hasAgent,
          agentName: session.agentName,
          joinedAt: session.joinedAt,
          lastSeen: session.lastSeen,
          isActive: session.isActive,
          customerEnded: session.customerEnded || false,
          adminEnded: session.adminEnded || false,
          endedAt: session.endedAt || null,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving to MongoDB:', error);
  }
}

// Load chat history from MongoDB
async function loadChatHistory(userId) {
  if (!liveChatHistoryCollection) return null;
  
  try {
    return await liveChatHistoryCollection.findOne({ userId });
  } catch (error) {
    console.error('Error loading from MongoDB:', error);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id, 'at', new Date().toISOString());

  // Allow clients to join RingCentral conversation rooms
  socket.on('join-conversation', ({ phoneNumber }) => {
    if (phoneNumber) {
      socket.join(`conversation:${phoneNumber}`);
      console.log(`Socket ${socket.id} joined conversation:${phoneNumber}`);
    }
  });

  socket.on('leave-conversation', ({ phoneNumber }) => {
    if (phoneNumber) {
      socket.leave(`conversation:${phoneNumber}`);
      console.log(`Socket ${socket.id} left conversation:${phoneNumber}`);
    }
  });

  socket.on('admin-join', async () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    console.log('Admin joined:', socket.id);
    
    const activeSessionsArray = Array.from(activeSessions.values());
    
    let recentChats = [];
    if (liveChatHistoryCollection) {
      try {
        recentChats = await liveChatHistoryCollection
          .find()
          .sort({ lastSeen: -1 })
          .limit(20)
          .toArray();
      } catch (error) {
        console.error('Error loading recent chats:', error);
      }
    }
    
    const activeUserIds = new Set(activeSessionsArray.map(s => s.userId));
    const historicalChats = recentChats.filter(chat => !activeUserIds.has(chat.userId));
    
    const allSessions = [...activeSessionsArray, ...historicalChats];
    
    socket.emit('active-sessions', allSessions);
    socket.emit('admin-connected', { success: true });
  });

  socket.on('load-more-chats', async ({ skip = 0, limit = 20 }) => {
    if (!liveChatHistoryCollection) {
      socket.emit('more-chats', { chats: [], hasMore: false });
      return;
    }
    
    try {
      const chats = await liveChatHistoryCollection
        .find()
        .sort({ lastSeen: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const totalCount = await liveChatHistoryCollection.countDocuments();
      const hasMore = (skip + limit) < totalCount;
      
      socket.emit('more-chats', { chats, hasMore, total: totalCount });
      console.log(`Loaded ${chats.length} more chats (skip: ${skip})`);
    } catch (error) {
      console.error('Error loading more chats:', error);
      socket.emit('more-chats', { chats: [], hasMore: false });
    }
  });

  socket.on('admin-delete-chat', async ({ userId, adminName }) => {
    try {
      console.log(`Admin ${adminName} requesting deletion of chat ${userId}`);
      
      if (!db || !liveChatHistoryCollection) {
        console.error('Database not available');
        socket.emit('delete-error', { 
          message: 'Database connection not available. Please try again.' 
        });
        return;
      }
      
      const chatToDelete = await liveChatHistoryCollection.findOne({ userId: userId });
      
      if (!chatToDelete) {
        console.log(`No chat found in database for user ${userId}`);
        socket.emit('delete-error', { 
          message: 'Chat not found in database.' 
        });
        return;
      }
      
      if (deletedChatsCollection) {
        const deletedRecord = {
          ...chatToDelete,
          deletedBy: adminName,
          deletedAt: new Date().toISOString(),
          originalChatId: chatToDelete._id,
          messageCount: chatToDelete.conversationHistory?.length || 0,
          chatDuration: calculateChatDuration(chatToDelete.joinedAt, chatToDelete.lastSeen),
        };
        
        await deletedChatsCollection.insertOne(deletedRecord);
        console.log(`Saved deleted chat to history: ${userId}`);
      }
      
      const result = await liveChatHistoryCollection.deleteOne({ userId: userId });
      
      if (result.deletedCount > 0) {
        console.log(`Chat deleted from active chats for user ${userId}`);
        
        activeSessions.delete(userId);
        
        const timer = agentWaitTimers.get(userId);
        if (timer) {
          clearTimeout(timer);
          agentWaitTimers.delete(userId);
        }
        
        io.to('admins').emit('chat-deleted', { 
          userId, 
          deletedBy: adminName 
        });
        
        io.to(`customer-${userId}`).emit('session-ended', {
          message: 'This chat session has been closed by an administrator.'
        });
        
        console.log(`All deletion notifications sent for ${userId}`);
      }
    } catch (error) {
      console.error('Error during chat deletion:', error);
      socket.emit('delete-error', { 
        message: `Failed to delete chat: ${error.message}`,
        error: error.message 
      });
    }
  });

  function calculateChatDuration(joinedAt, lastSeen) {
    try {
      const start = new Date(joinedAt);
      const end = new Date(lastSeen || new Date());
      const durationMs = end.getTime() - start.getTime();
      const minutes = Math.floor(durationMs / 60000);
      
      if (minutes < 1) return "< 1 min";
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;
        return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
      }
      return `${minutes} min`;
    } catch (error) {
      return "Unknown";
    }
  }

  socket.on('get-deleted-chats', async ({ skip = 0, limit = 20 }) => {
    if (!deletedChatsCollection) {
      socket.emit('deleted-chats-response', { chats: [], hasMore: false, total: 0 });
      return;
    }
    
    try {
      const deletedChats = await deletedChatsCollection
        .find()
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const totalCount = await deletedChatsCollection.countDocuments();
      const hasMore = (skip + limit) < totalCount;
      
      socket.emit('deleted-chats-response', { 
        chats: deletedChats, 
        hasMore, 
        total: totalCount 
      });
      
      console.log(`Sent ${deletedChats.length} deleted chats to admin`);
    } catch (error) {
      console.error('Error loading deleted chats:', error);
      socket.emit('deleted-chats-response', { chats: [], hasMore: false, total: 0 });
    }
  });

  socket.on('restore-deleted-chat', async ({ deletedChatId, adminName }) => {
    if (!deletedChatsCollection || !liveChatHistoryCollection) {
      socket.emit('restore-error', { message: 'Database not available' });
      return;
    }
    
    try {
      const { ObjectId } = require('mongodb');
      
      let objectId;
      try {
        objectId = new ObjectId(deletedChatId);
      } catch (err) {
        socket.emit('restore-error', { message: 'Invalid chat ID format' });
        return;
      }
      
      const deletedChat = await deletedChatsCollection.findOne({ _id: objectId });
      
      if (!deletedChat) {
        console.log(`Deleted chat not found with ID: ${deletedChatId}`);
        socket.emit('restore-error', { message: 'Deleted chat not found' });
        return;
      }
      
      const { deletedBy, deletedAt, originalChatId, messageCount, chatDuration, _id, ...chatToRestore } = deletedChat;
      
      await liveChatHistoryCollection.insertOne({
        ...chatToRestore,
        restoredBy: adminName,
        restoredAt: new Date().toISOString(),
        isActive: false,
        customerEnded: false,
        adminEnded: false,
      });
      
      await deletedChatsCollection.deleteOne({ _id: objectId });
      
      socket.emit('restore-success', { 
        message: 'Chat restored successfully',
        userId: chatToRestore.userId 
      });
      
      io.to('admins').emit('chat-restored', { userId: chatToRestore.userId });
      
    } catch (error) {
      console.error('Error restoring chat:', error);
      socket.emit('restore-error', { 
        message: `Failed to restore chat: ${error.message}` 
      });
    }
  });

  socket.on('delete-message', async ({ messageId, userId }) => {
    try {
      if (!db || !liveChatHistoryCollection) {
        console.error('Database not available');
        socket.emit('delete-error', { 
          message: 'Database connection not available. Please try again.' 
        });
        return;
      }

      const result = await liveChatHistoryCollection.updateOne(
        { userId: userId },
        { $pull: { conversationHistory: { id: messageId } } }
      );

      if (result.modifiedCount > 0) {
        const session = activeSessions.get(userId);
        if (session) {
          session.conversationHistory = session.conversationHistory.filter(
            msg => msg.id !== messageId
          );
        }

        io.to(`customer-${userId}`).emit('message-deleted', { messageId });
        io.to('admins').emit('message-deleted', { messageId });
        
      } else {
        socket.emit('delete-error', { 
          message: 'Message not found. It may have already been deleted.' 
        });
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      socket.emit('delete-error', { 
        message: `Failed to delete message: ${err.message}`,
        error: err.message 
      });
    }
  });

  socket.on('customer-join', async ({ userId, userName, userPhone, conversationHistory }) => {
    let sessionData = activeSessions.get(userId);
    
    if (sessionData) {
      sessionData.socketId = socket.id;
      sessionData.isActive = true;
      sessionData.lastSeen = new Date().toISOString();
      
      socket.emit('chat-history', sessionData.conversationHistory);
      io.to('admins').emit('customer-reconnected', sessionData);
    } else {
      const savedSession = await loadChatHistory(userId);
      
      if (savedSession && !savedSession.customerEnded && !savedSession.adminEnded) {
        sessionData = {
          ...savedSession,
          socketId: socket.id,
          isActive: true,
          lastSeen: new Date().toISOString()
        };
        socket.emit('chat-history', sessionData.conversationHistory);
      } else {
        sessionData = {
          userId,
          userName,
          userPhone,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isActive: true,
          hasAgent: false,
          conversationHistory: conversationHistory || []
        };
      }
      
      activeSessions.set(userId, sessionData);
      io.to('admins').emit('customer-joined', sessionData);
      
      const timer = setTimeout(() => {
        const session = activeSessions.get(userId);
        if (session && !session.hasAgent && session.isActive) {
          sendNoAgentNotification(session);
        }
      }, 5 * 60 * 1000);
      
      agentWaitTimers.set(userId, timer);
    }
    
    socket.join(`customer-${userId}`);
    await saveChatHistory(sessionData);
  });

  socket.on('admin-claim-customer', async ({ userId, adminName }) => {
    const session = activeSessions.get(userId);
    if (session && !session.hasAgent) {
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      session.hasAgent = true;
      session.agentName = adminName;
      session.agentSocketId = socket.id;
      session.claimedAt = new Date().toISOString();
      
      socket.join(`customer-${userId}`);
      
      io.to(`customer-${userId}`).emit('agent-joined', {
        agentName: adminName,
        message: `${adminName} has joined the chat`
      });
      
      io.to('admins').emit('session-updated', session);
      await saveChatHistory(session);
    }
  });

  socket.on('customer-message', async ({ userId, userName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.lastSeen = new Date().toISOString();
      
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        userName,
        content,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        isAdmin: false,
        timestamp: new Date().toISOString()
      };
      
      session.conversationHistory.push(message);
      
      io.to(`customer-${userId}`).emit('new-message', message);
      io.to('admins').emit('customer-message-notification', { userId, userName, message });
      
      await saveChatHistory(session);
    }
  });

  socket.on('admin-message', async ({ userId, agentName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        userName: agentName,
        content,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        isAdmin: true,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      session.conversationHistory.push(message);
      
      io.to(`customer-${userId}`).emit('new-message', message);
      io.to('admins').emit('admin-message-sent', { userId, message });
      
      await saveChatHistory(session);
    }
  });

  socket.on('admin-typing', ({ userId, isTyping, agentName }) => {
    io.to(`customer-${userId}`).emit('admin-typing-indicator', { isTyping, agentName });
  });

  socket.on('customer-typing', ({ userId, isTyping }) => {
    io.to('admins').emit('customer-typing-indicator', { userId, isTyping });
  });

  socket.on('end-session', async ({ userId }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.isActive = false;
      session.adminEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to(`customer-${userId}`).emit('session-ended', {
        message: `${session.agentName} has ended the chat session. Thank you for contacting us!`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      await saveChatHistory(session);
      setTimeout(() => activeSessions.delete(userId), 30 * 60 * 1000);
    }
  });

  socket.on('customer-end-session', async ({ userId }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.isActive = false;
      session.customerEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to('admins').emit('customer-ended-session', {
        userId,
        userName: session.userName,
        message: `${session.userName} has ended the chat session.`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      await saveChatHistory(session);
      setTimeout(() => activeSessions.delete(userId), 30 * 60 * 1000);
      
      socket.emit('session-end-confirmed');
    }
  });

  socket.on('disconnect', async (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
      for (const [userId, session] of activeSessions.entries()) {
        if (session.agentSocketId === socket.id) {
          session.hasAgent = false;
          delete session.agentName;
          delete session.agentSocketId;
          
          io.to('admins').emit('session-updated', session);
          io.to(`customer-${userId}`).emit('agent-left', { message: 'Agent has disconnected' });
          await saveChatHistory(session);
        }
      }
    }
    
    for (const [userId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {
        session.isActive = false;
        session.lastSeen = new Date().toISOString();
        io.to('admins').emit('customer-disconnected', { userId, session });
        await saveChatHistory(session);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Cleanup inactive sessions every 5 minutes
setInterval(async () => {
  const now = new Date();
  for (const [userId, session] of activeSessions.entries()) {
    const lastSeen = new Date(session.lastSeen);
    const minutesInactive = (now - lastSeen) / (1000 * 60);
    
    if (minutesInactive > 120) {
      await saveChatHistory(session);
      activeSessions.delete(userId);
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
    }
  }
}, 5 * 60 * 1000);

io.engine.on('connection_error', (err) => {
  console.error('Connection error:', err);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`RingCentral real-time endpoint: POST /notify/ringcentral`);
  console.log(`Health check: GET /health`);
  console.log(`Manual sync trigger: POST /trigger-sync`);
  console.log(`Server ready at ${new Date().toISOString()}`);
});