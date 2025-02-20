// src/websocket/WebSocketServer.js
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';
import { connectToInstitutionDB } from './dbConnection.js';
import { getMessageModel } from './models/Messages.js';

class WebSocketServer {
  constructor() {
    this.clients = new Map();
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    console.log('WebSocket Server initialized');
  }

  async handleConnection(ws, req) {
    try {
      // Get token from query parameters
      const params = new URLSearchParams(req.url.split('?')[1]);
      const token = params.get('token');

      if (!token) {
        ws.close(4001, 'No token provided');
        return;
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      const userRole = decoded.role;
      const institutionName = decoded.institutionName;

      // Store client information
      this.clients.set(ws, {
        userId,
        userRole,
        institutionName,
        isAlive: true
      });

      // Setup ping-pong for connection health check
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
        this.broadcastUserStatus(institutionName, userId, false);
      });

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection',
        payload: {
          status: 'connected',
          userId,
          userRole
        }
      }));

      // Broadcast user online status
      this.broadcastUserStatus(institutionName, userId, true);

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(4002, 'Authentication failed');
    }
  }

  async handleMessage(ws, data) {
    const client = this.clients.get(ws);
    if (!client) return;

    const { userId, userRole, institutionName } = client;

    switch (data.type) {
      case 'message':
        await this.handleChatMessage(institutionName, userId, userRole, data.payload);
        break;

      case 'typing':
        this.broadcastTypingStatus(institutionName, userId, data.payload);
        break;

      case 'read':
        await this.handleReadReceipt(institutionName, userId, data.payload);
        break;
    }
  }

  async handleChatMessage(institutionName, senderId, senderRole, payload) {
    try {
      const connection = await connectToInstitutionDB(institutionName);
      const Message = getMessageModel(connection);

      const newMessage = new Message({
        senderId,
        senderRole,
        receiverId: payload.receiverId,
        receiverRole: payload.receiverRole,
        message: payload.message,
        timeStamp: new Date()
      });

      await newMessage.save();

      this.broadcastToUsers(institutionName, [senderId, payload.receiverId], {
        type: 'message',
        payload: {
          _id: newMessage._id,
          senderId,
          senderRole,
          receiverId: payload.receiverId,
          receiverRole: payload.receiverRole,
          message: payload.message,
          timeStamp: newMessage.timeStamp,
          read: false
        }
      });
    } catch (error) {
      console.error('Error handling chat message:', error);
    }
  }

  broadcastTypingStatus(institutionName, userId, payload) {
    this.broadcastToUsers(institutionName, [userId, payload.receiverId], {
      type: 'typing',
      payload: {
        userId,
        receiverId: payload.receiverId,
        isTyping: payload.isTyping
      }
    });
  }

  async handleReadReceipt(institutionName, userId, payload) {
    try {
      const connection = await connectToInstitutionDB(institutionName);
      const Message = getMessageModel(connection);

      await Message.updateMany(
        {
          senderId: payload.senderId,
          receiverId: userId,
          read: false
        },
        { $set: { read: true } }
      );

      this.broadcastToUsers(institutionName, [userId, payload.senderId], {
        type: 'read',
        payload: {
          userId,
          senderId: payload.senderId
        }
      });
    } catch (error) {
      console.error('Error handling read receipt:', error);
    }
  }

  broadcastUserStatus(institutionName, userId, isOnline) {
    this.broadcastToInstitution(institutionName, {
      type: 'userStatus',
      payload: {
        userId,
        isOnline
      }
    });
  }

  broadcastToUsers(institutionName, userIds, message) {
    this.clients.forEach((clientInfo, client) => {
      if (
        clientInfo.institutionName === institutionName &&
        userIds.includes(clientInfo.userId) &&
        client.readyState === WebSocket.OPEN
      ) {
        client.send(JSON.stringify(message));
      }
    });
  }

  broadcastToInstitution(institutionName, message) {
    this.clients.forEach((clientInfo, client) => {
      if (
        clientInfo.institutionName === institutionName &&
        client.readyState === WebSocket.OPEN
      ) {
        client.send(JSON.stringify(message));
      }
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Check every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

export default new WebSocketServer();