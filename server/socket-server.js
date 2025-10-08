const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');

// ✅ Node 22 has global fetch — no need for node-fetch

const httpServer = createServer();
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

// MongoDB Connection
let db;
let liveChatHistoryCollection;

async function connectMongoDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("❌ Missing MONGODB_URI environment variable");
    }

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db('db');
    liveChatHistoryCollection = db.collection('live_chat_history');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}

connectMongoDB();

const activeSessions = new Map();
const adminSockets = new Set();
const agentWaitTimers = new Map(); // Track 5-minute timers

// Send SMS notification when no agent connects
async function sendNoAgentNotification(session) {
  try {
    const message = `URGENT: Customer ${session.userName} (${session.userPhone}) has been waiting for 5 minutes without an agent response. Live chat needs attention!`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = '+19727486404';
    const smsUrl = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;
    
    await fetch(smsUrl); // ✅ Using built-in fetch
    console.log('📱 Sent no-agent notification SMS for:', session.userName);
  } catch (error) {
    console.error('❌ Failed to send SMS notification:', error);
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
    console.error('❌ Error saving to MongoDB:', error);
  }
}

// Load chat history from MongoDB
async function loadChatHistory(userId) {
  if (!liveChatHistoryCollection) return null;
  
  try {
    return await liveChatHistoryCollection.findOne({ userId });
  } catch (error) {
    console.error('❌ Error loading from MongoDB:', error);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id, 'at', new Date().toISOString());

  socket.on('admin-join', async () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    console.log('👤 Admin joined:', socket.id);
    
    const activeSessionsArray = Array.from(activeSessions.values());
    
    // Load recent chat history from MongoDB (top 20)
    let recentChats = [];
    if (liveChatHistoryCollection) {
      try {
        recentChats = await liveChatHistoryCollection
          .find()
          .sort({ lastSeen: -1 })
          .limit(20)
          .toArray();
      } catch (error) {
        console.error('❌ Error loading recent chats:', error);
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
      console.log(`📄 Loaded ${chats.length} more chats (skip: ${skip})`);
    } catch (error) {
      console.error('❌ Error loading more chats:', error);
      socket.emit('more-chats', { chats: [], hasMore: false });
    }
  });

  socket.on('customer-join', async ({ userId, userName, userPhone, conversationHistory }) => {
    let sessionData = activeSessions.get(userId);
    
    if (sessionData) {
      console.log('🔄 Customer reconnecting:', userId);
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
        console.log('📂 Restored session from MongoDB:', userId);
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
        console.log('🙋 New customer joined:', userId, userName);
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
      
      console.log(`🤝 Admin ${adminName} claimed customer ${userId}`);
    }
  });

  socket.on('customer-message', async ({ userId, userName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.lastSeen = new Date().toISOString();
      
      const message = {
        id: Date.now().toString(),
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
      console.log(`💬 Customer message from ${userName}`);
    }
  });

  socket.on('admin-message', async ({ userId, agentName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      const message = {
        id: Date.now().toString(),
        userId,
        userName: agentName,
        content,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        isAdmin: true,
        timestamp: new Date().toISOString()
      };
      
      session.conversationHistory.push(message);
      io.to(`customer-${userId}`).emit('new-message', message);
      socket.to('admins').emit('admin-message-sent', { userId, message });
      
      await saveChatHistory(session);
      console.log(`💬 Admin message from ${agentName} to ${userId}`);
    }
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
      console.log('🔴 Session ended by admin:', userId);
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
      console.log('🔴 Customer ended session:', userId);
    }
  });

  socket.on('disconnect', async (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
    
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
        console.log('📱 Customer went inactive:', userId);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Clean up inactive sessions every 5 minutes
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
      
      console.log('🧹 Cleaned up inactive session:', userId);
    }
  }
}, 5 * 60 * 1000);

io.engine.on('connection_error', (err) => {
  console.error('❌ Connection error:', err);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 Server ready to accept connections at ${new Date().toISOString()}`);
});
