// socketManager.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { connectToInstitutionDB } from './dbConnection.js';
import { getMessageModel } from './models/Messages.js';
import { getChatRequestModel } from './models/ChatRequest.js';

// Map to store user socket instances
const userSockets = new Map();

export const initializeSocketIO = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // JWT Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            
            // Connect to institution database
            const connection = await connectToInstitutionDB(decoded.institutionName);
            socket.dbConnection = connection;
            
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.user.id;
        const institutionName = socket.user.institutionName;

        console.log(`User connected: ${userId} from institution: ${institutionName}`);

        // Store socket instance
        userSockets.set(userId, socket);

        // Join personal room and institution room
        socket.join(userId);
        socket.join(`institution_${institutionName}`);

        // Handle new message
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, message, receiverRole } = data;
                const Message = getMessageModel(socket.dbConnection);
                const ChatRequest = getChatRequestModel(socket.dbConnection);

                // Verify friendship status
                const areFriends = await ChatRequest.findOne({
                    $or: [
                        { from: userId, to: receiverId },
                        { from: receiverId, to: userId }
                    ],
                    status: 'ACCEPTED'
                });

                if (!areFriends) {
                    socket.emit('error', { message: 'You must be friends to send messages' });
                    return;
                }

                // Create and save new message
                const newMessage = new Message({
                    senderId: userId,
                    senderRole: socket.user.role,
                    receiverId,
                    receiverRole,
                    message,
                    timeStamp: new Date()
                });

                await newMessage.save();

                // Emit to both sender and receiver rooms
                io.to(userId).emit('receive_message', {
                    ...newMessage.toObject(),
                    chatId: receiverId
                });
                
                io.to(receiverId).emit('receive_message', {
                    ...newMessage.toObject(),
                    chatId: userId
                });

                // Send delivery confirmation to sender
                socket.emit('message_sent', {
                    messageId: newMessage._id,
                    status: 'sent'
                });

            } catch (error) {
                console.error('Message sending error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle user typing status
        socket.on('typing_status', ({ receiverId, isTyping }) => {
            io.to(receiverId).emit('user_typing', {
                userId,
                isTyping
            });
        });

        // Handle message seen status
        socket.on('message_seen', async (data) => {
            try {
                const { messageId, senderId } = data;
                const Message = getMessageModel(socket.dbConnection);
                
                await Message.findByIdAndUpdate(messageId, { seen: true });
                
                io.to(senderId).emit('message_status_update', {
                    messageId,
                    status: 'seen'
                });
            } catch (error) {
                console.error('Message seen status error:', error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${userId}`);
            userSockets.delete(userId);
            socket.leave(userId);
            socket.leave(`institution_${institutionName}`);
        });

        // Fetch and send any missed messages
        try {
            const Message = getMessageModel(socket.dbConnection);
            const missedMessages = await Message.find({
                receiverId: userId,
                timeStamp: { 
                    $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                },
                seen: false
            }).sort({ timeStamp: 1 });

            if (missedMessages.length > 0) {
                missedMessages.forEach(message => {
                    socket.emit('receive_message', {
                        ...message.toObject(),
                        chatId: message.senderId
                    });
                });
            }
        } catch (error) {
            console.error('Error fetching missed messages:', error);
        }
    });

    return io;
};

// Export function to get socket instance for a user
export const getUserSocket = (userId) => userSockets.get(userId);