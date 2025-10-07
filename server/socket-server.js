//server
const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://www.texaspremiumins.com",
      "https://texaspremium-git-main-amber2505s-projects.vercel.app",
      "https://texaspremium-elczh28e2-amber2505s-projects.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
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

  socket.on('customer-join', ({ userId, userName, userPhone, conversationHistory }) => {
    const sessionData = {
      userId,
      userName,
      userPhone,
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

  socket.on('customer-message', ({ userId, userName, content, fileUrl, fileName }) => {
  const session = activeSessions.get(userId);
  if (session) {
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
    io.to(`customer-${userId}`).emit('new-message', message);
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
        message: `${session.agentName} has ended the chat session. Thank you for contacting us!`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      setTimeout(() => {
        activeSessions.delete(userId);
      }, 5 * 60 * 1000);
      
      console.log('Session ended:', userId);
    }
  });

  socket.on('customer-end-session', ({ userId }) => {
  console.log('🔴 SERVER: Received customer-end-session');
  console.log('🔴 SERVER: userId:', userId);
  console.log('🔴 SERVER: socket.id:', socket.id);
  
  const session = activeSessions.get(userId);
  console.log('🔴 SERVER: Found session:', !!session);
  
  if (session) {
    console.log('🔴 SERVER: About to emit to admins');
    
    io.to('admins').emit('customer-ended-session', {
      userId: userId,
      userName: session.userName,
      message: `${session.userName} has ended the chat session.`
    });
    
    io.to('admins').emit('session-ended', { userId });
    
    activeSessions.delete(userId);
    console.log('🔴 SERVER: Events emitted, session deleted');
    
    // Send confirmation back to customer
    socket.emit('session-end-confirmed');
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
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server running on port ${PORT}`);
});