const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

const activeSessions = new Map();
const adminSockets = new Set();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('admin-join', () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    console.log('Admin joined:', socket.id);
    
    const sessions = Array.from(activeSessions.values());
    socket.emit('active-sessions', sessions);
  });

  socket.on('customer-join', ({ userId, userName, conversationHistory }) => {
    const sessionData = {
      userId,
      userName,
      socketId: socket.id,
      joinedAt: new Date().toISOString(),
      isActive: true,
      hasAgent: false,
      conversationHistory: conversationHistory || []
    };
    
    activeSessions.set(userId, sessionData);
    socket.join(`customer-${userId}`);
    
    io.to('admins').emit('customer-joined', sessionData);
    socket.emit('chat-history', sessionData.conversationHistory);
    
    console.log('Customer joined:', userId, userName);
  });

  socket.on('admin-claim-customer', ({ userId, adminName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.hasAgent = true;
      session.agentName = adminName;
      session.agentSocketId = socket.id;
      
      socket.join(`customer-${userId}`);
      
      io.to(`customer-${userId}`).emit('agent-joined', {
        agentName: adminName,
        message: `${adminName} has joined the chat`
      });
      
      io.to('admins').emit('session-updated', session);
      
      console.log(`Admin ${adminName} claimed customer ${userId}`);
    }
  });

  socket.on('customer-message', ({ userId, userName, content }) => {
    const session = activeSessions.get(userId);
    if (session) {
      const message = {
        id: Date.now().toString(),
        userId,
        userName,
        content,
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
      
      console.log(`Message from customer ${userId}:`, content);
    }
  });

  socket.on('admin-message', ({ userId, agentName, content }) => {
    const session = activeSessions.get(userId);
    if (session) {
      const message = {
        id: Date.now().toString(),
        userId,
        userName: agentName,
        content,
        isAdmin: true,
        timestamp: new Date().toISOString()
      };
      
      session.conversationHistory.push(message);
      io.to(`customer-${userId}`).emit('new-message', message);
      
      console.log(`Message from admin to ${userId}:`, content);
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
      session.endedAt = new Date().toISOString();
      
      io.to(`customer-${userId}`).emit('session-ended', {
        message: 'Chat session ended. Thank you for contacting us!'
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      setTimeout(() => {
        activeSessions.delete(userId);
      }, 5 * 60 * 1000);
      
      console.log('Session ended:', userId);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
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
    
    activeSessions.forEach((session, userId) => {
      if (session.socketId === socket.id) {
        session.isActive = false;
        io.to('admins').emit('customer-disconnected', { userId });
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});