// services/socketService.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  const userSockets = new Map();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.user.id);
    
    // Store user socket mapping with institution name
    userSockets.set(`${socket.user.id}_${socket.user.institutionName}`, socket);

    // Join institution-specific room
    socket.join(`institution_${socket.user.institutionName}`);
    socket.join(`user_${socket.user.id}`); // Add personal room

    // Handle private messages
    socket.on('private message', async (data) => {
      // Emit to specific user's room instead of direct socket
      io.to(`user_${data.receiverId}`).emit('private message', {
        ...data,
        senderId: socket.user.id,
        senderRole: socket.user.role,
        institutionName: socket.user.institutionName
      });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.user.id);
      userSockets.delete(`${socket.user.id}_${socket.user.institutionName}`);
    });
});

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};