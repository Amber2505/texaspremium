const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const express = require('express'); // ← Added for HTTP routes

const httpServer = createServer();
const app = express();
app.use(express.json()); // Parse JSON bodies

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

// Attach Express app to the same HTTP server
httpServer.on('request', app);
// ================================================

// MongoDB Connection
let db;
let liveChatHistoryCollection;
let deletedChatsCollection;

async function connectMongoDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    console.log('Attempting to connect to MongoDB...');
    
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    await client.connect();
    await client.db().admin().ping();
    console.log('MongoDB ping successful');
    
    db = client.db('myFirstDatabase');
    liveChatHistoryCollection = db.collection('live_chat_history');
    deletedChatsCollection = db.collection('deleted_chats_history');
    
    const count = await liveChatHistoryCollection.countDocuments();
    console.log(`MongoDB connected successfully. Found ${count} existing chat records.`);
    
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.error('Stack:', error.stack);
    db = null;
    liveChatHistoryCollection = null;
    deletedChatsCollection = null;
    return false;
  }
}

async function startServer() {
  const dbConnected = await connectMongoDB();
  
  if (!dbConnected) {
    console.error('Server starting WITHOUT database connection');
    console.error('Chat history and delete features will not work');
  }
}

startServer();

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
  console.log(`Server ready at ${new Date().toISOString()}`);
});