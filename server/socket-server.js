const { createServer } = require('http');
const { Server } = require('socket.io');

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
  // Increased timeouts for persistent connections
  pingTimeout: 120000, // 2 minutes
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  // Allow reconnection
  allowEIO3: true
});

const activeSessions = new Map();
const adminSockets = new Set();

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id, 'at', new Date().toISOString());

  socket.on('admin-join', () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    console.log('👤 Admin joined:', socket.id);
    
    const sessions = Array.from(activeSessions.values());
    socket.emit('active-sessions', sessions);
    socket.emit('admin-connected', { success: true });
  });

  socket.on('customer-join', ({ userId, userName, userPhone, conversationHistory }) => {
    // Check if session already exists (reconnection)
    let sessionData = activeSessions.get(userId);
    
    if (sessionData) {
      // Reconnecting customer
      console.log('🔄 Customer reconnecting:', userId);
      sessionData.socketId = socket.id;
      sessionData.isActive = true;
      sessionData.lastSeen = new Date().toISOString();
      
      // Send conversation history back
      socket.emit('chat-history', sessionData.conversationHistory);
      
      // Notify admins of reconnection
      io.to('admins').emit('customer-reconnected', sessionData);
    } else {
      // New customer
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
      
      activeSessions.set(userId, sessionData);
      io.to('admins').emit('customer-joined', sessionData);
      console.log('🙋 New customer joined:', userId, userName);
    }
    
    socket.join(`customer-${userId}`);
  });

  socket.on('admin-claim-customer', ({ userId, adminName }) => {
    const session = activeSessions.get(userId);
    if (session && !session.hasAgent) {
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
      
      console.log(`🤝 Admin ${adminName} claimed customer ${userId}`);
    }
  });

  socket.on('customer-message', ({ userId, userName, content, fileUrl, fileName }) => {
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
      io.to('admins').emit('customer-message-notification', {
        userId,
        userName,
        message
      });
      
      console.log(`💬 Customer message from ${userName}`);
    }
  });

  socket.on('admin-message', ({ userId, agentName, content, fileUrl, fileName }) => {
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
      
      // Send to customer
      io.to(`customer-${userId}`).emit('new-message', message);
      
      // Also update other admins viewing this session
      io.to('admins').emit('admin-message-sent', {
        userId,
        message
      });
      
      console.log(`💬 Admin message from ${agentName} to ${userId}`);
    }
  });

  socket.on('customer-typing', ({ userId, isTyping }) => {
    io.to('admins').emit('customer-typing-indicator', { userId, isTyping });
  });

  socket.on('admin-typing', ({ userId, isTyping, agentName }) => {
    io.to(`customer-${userId}`).emit('agent-typing-indicator', { isTyping, agentName });
  });

  socket.on('end-session', ({ userId }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.isActive = false;
      session.adminEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to(`customer-${userId}`).emit('session-ended', {
        message: `${session.agentName} has ended the chat session. Thank you for contacting us!`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      // Keep session data for 30 minutes for potential reconnection
      setTimeout(() => {
        activeSessions.delete(userId);
        console.log('🗑️ Session data cleared:', userId);
      }, 30 * 60 * 1000);
      
      console.log('🔴 Session ended by admin:', userId);
    }
  });

  socket.on('customer-end-session', ({ userId }) => {
    console.log('🔴 SERVER: Received customer-end-session');
    
    const session = activeSessions.get(userId);
    
    if (session) {
      session.isActive = false;
      session.customerEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to('admins').emit('customer-ended-session', {
        userId: userId,
        userName: session.userName,
        message: `${session.userName} has ended the chat session.`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      // Keep session data for 30 minutes
      setTimeout(() => {
        activeSessions.delete(userId);
      }, 30 * 60 * 1000);
      
      socket.emit('session-end-confirmed');
      console.log('🔴 SERVER: Customer ended session:', userId);
    }
  });

  // Handle heartbeat to keep connection alive
  socket.on('heartbeat', ({ userId, userType }) => {
    if (userType === 'customer') {
      const session = activeSessions.get(userId);
      if (session) {
        session.lastSeen = new Date().toISOString();
        session.isActive = true;
      }
    }
    socket.emit('heartbeat-ack');
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
    
    // Handle admin disconnect
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
      
      activeSessions.forEach((session, userId) => {
        if (session.agentSocketId === socket.id) {
          session.hasAgent = false;
          delete session.agentName;
          delete session.agentSocketId;
          
          io.to('admins').emit('session-updated', session);
          io.to(`customer-${userId}`).emit('agent-left', {
            message: 'Agent has disconnected'
          });
        }
      });
    }
    
    // Handle customer disconnect - mark as inactive but keep session
    activeSessions.forEach((session, userId) => {
      if (session.socketId === socket.id) {
        session.isActive = false;
        session.lastSeen = new Date().toISOString();
        io.to('admins').emit('customer-disconnected', { userId, session });
        console.log('📱 Customer went inactive:', userId);
      }
    });
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Clean up old inactive sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  activeSessions.forEach((session, userId) => {
    const lastSeen = new Date(session.lastSeen);
    const minutesInactive = (now - lastSeen) / (1000 * 60);
    
    // Remove sessions inactive for more than 2 hours
    if (minutesInactive > 120) {
      activeSessions.delete(userId);
      console.log('🧹 Cleaned up inactive session:', userId);
    }
  });
}, 5 * 60 * 1000);

io.engine.on('connection_error', (err) => {
  console.error('❌ Connection error:', err);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 Server ready to accept connections at ${new Date().toISOString()}`);
});