// controllers/ChatController.js
import { getGymManagerModel } from '../models/GymManager.js';
import { getGymMemberModel } from '../models/GymMember.js';
import { getMessageModel } from '../models/Messages.js';
import { getChatRequestModel } from '../models/ChatRequest.js';
import { connectToInstitutionDB } from '../dbConnection.js';

export const chatController = {
    // Get all users (members and manager) except the current user
    getAllUsers: async (req, res) => {
        try {
            const { institutionName } = req.params;
            const currentUserId = req.user.id;
            const currentUserRole = req.user.role;

            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);
            const GymMember = getGymMemberModel(connection);
            const ChatRequest = getChatRequestModel(connection);

            // Get all active chat requests for the current user
            const chatRequests = await ChatRequest.find({
                $or: [
                    { from: currentUserId },
                    { to: currentUserId }
                ]
            });

            // Get manager
            const manager = await GymManager.findOne({}, { password: 0 });
            
            // Get all approved members
            const members = await GymMember.find(
                { isApproved: true, _id: { $ne: currentUserId } },
                { password: 0 }
            );

            // Format users with their roles and chat status
            const users = [];
            
            if (manager && manager._id.toString() !== currentUserId) {
                const requestStatus = chatRequests.find(req => 
                    (req.from.toString() === currentUserId && req.to.toString() === manager._id.toString()) ||
                    (req.to.toString() === currentUserId && req.from.toString() === manager._id.toString())
                );

                users.push({
                    _id: manager._id,
                    name: manager.name,
                    email: manager.email,
                    role: 'MANAGER',
                    chatStatus: requestStatus ? requestStatus.status : 'NONE'
                });
            }

            members.forEach(member => {
                const requestStatus = chatRequests.find(req => 
                    (req.from.toString() === currentUserId && req.to.toString() === member._id.toString()) ||
                    (req.to.toString() === currentUserId && req.from.toString() === member._id.toString())
                );

                users.push({
                    _id: member._id,
                    name: member.name,
                    email: member.email,
                    role: 'MEMBER',
                    chatStatus: requestStatus ? requestStatus.status : 'NONE'
                });
            });

            res.json(users);
        } catch (error) {
            console.error('Get all users error:', error);
            res.status(500).json({ message: 'Failed to get users' });
        }
    },

    // Send chat request
    sendRequest: async (req, res) => {
        try {
            const { institutionName, receiverId, receiverRole, message } = req.body;
            const senderId = req.user.id;
            const senderRole = req.user.role;

            const connection = await connectToInstitutionDB(institutionName);
            const ChatRequest = getChatRequestModel(connection);

            // Check if request already exists
            const existingRequest = await ChatRequest.findOne({
                $or: [
                    { from: senderId, to: receiverId },
                    { from: receiverId, to: senderId }
                ]
            });

            if (existingRequest) {
                return res.status(400).json({ 
                    message: 'A chat request already exists between these users' 
                });
            }

            // Create new request
            const newRequest = new ChatRequest({
                from: senderId,
                fromRole: senderRole,
                to: receiverId,
                toRole: receiverRole,
                message
            });

            await newRequest.save();

            res.status(201).json({ 
                message: 'Chat request sent successfully',
                request: newRequest
            });
        } catch (error) {
            console.error('Send request error:', error);
            res.status(500).json({ message: 'Failed to send request' });
        }
    },

    // Get all pending requests for a user
    getRequests: async (req, res) => {
        try {
            const { institutionName } = req.params;
            const userId = req.user.id;

            const connection = await connectToInstitutionDB(institutionName);
            const ChatRequest = getChatRequestModel(connection);
            const GymManager = getGymManagerModel(connection);
            const GymMember = getGymMemberModel(connection);

            // Get pending requests
            const requests = await ChatRequest.find({
                to: userId,
                status: 'PENDING'
            });

            // Populate sender details
            const populatedRequests = await Promise.all(requests.map(async (request) => {
                let sender;
                if (request.fromRole === 'MANAGER') {
                    sender = await GymManager.findById(request.from, { password: 0 });
                } else {
                    sender = await GymMember.findById(request.from, { password: 0 });
                }

                return {
                    _id: request._id,
                    from: {
                        _id: sender._id,
                        name: sender.name,
                        email: sender.email,
                        role: request.fromRole
                    },
                    message: request.message,
                    timeStamp: request.timeStamp
                };
            }));

            res.json(populatedRequests);
        } catch (error) {
            console.error('Get requests error:', error);
            res.status(500).json({ message: 'Failed to get requests' });
        }
    },

    // Handle request (accept/reject)
    handleRequest: async (req, res) => {
        try {
            const { institutionName, requestId, action } = req.body;
            const userId = req.user.id;

            const connection = await connectToInstitutionDB(institutionName);
            const ChatRequest = getChatRequestModel(connection);

            const request = await ChatRequest.findById(requestId);
            if (!request) {
                return res.status(404).json({ message: 'Request not found' });
            }

            if (request.to.toString() !== userId) {
                return res.status(403).json({ message: 'Unauthorized to handle this request' });
            }

            request.status = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
            await request.save();

            res.json({ 
                message: `Request ${action}ed successfully`,
                request
            });
        } catch (error) {
            console.error('Handle request error:', error);
            res.status(500).json({ message: 'Failed to handle request' });
        }
    },

    // Get chat friends
    getFriends: async (req, res) => {
        try {
            const { institutionName } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            const connection = await connectToInstitutionDB(institutionName);
            const ChatRequest = getChatRequestModel(connection);
            const GymManager = getGymManagerModel(connection);
            const GymMember = getGymMemberModel(connection);

            // Get all accepted requests where user is either sender or receiver
            const acceptedRequests = await ChatRequest.find({
                $or: [
                    { from: userId, status: 'ACCEPTED' },
                    { to: userId, status: 'ACCEPTED' }
                ]
            });

            // Get friend details
            const friends = await Promise.all(acceptedRequests.map(async (request) => {
                const isSender = request.from.toString() === userId;
                const friendId = isSender ? request.to : request.from;
                const friendRole = isSender ? request.toRole : request.fromRole;

                let friend;
                if (friendRole === 'MANAGER') {
                    friend = await GymManager.findById(friendId, { password: 0 });
                } else {
                    friend = await GymMember.findById(friendId, { password: 0 });
                }

                if (!friend) {
                    return null;
                }

                return {
                    _id: friend._id,
                    name: friend.name,
                    email: friend.email,
                    role: friendRole,
                    lastMessage: null // You can add last message functionality here
                };
            }));

            // Filter out any null entries (in case a friend was deleted)
            const validFriends = friends.filter(friend => friend !== null);

            res.json(validFriends);
        } catch (error) {
            console.error('Get friends error:', error);
            res.status(500).json({ message: 'Failed to get friends' });
        }
    },

    // Send message
    sendMessage: async (req, res) => {
        try {
            const { institutionName, receiverId, receiverRole, message } = req.body;
            const senderId = req.user.id;
            const senderRole = req.user.role;

            console.log('Message attempt:', {
                senderId,
                senderRole,
                receiverId,
                receiverRole,
                message: message.substring(0, 50) // Log first 50 chars for privacy
            });

            const connection = await connectToInstitutionDB(institutionName);
            const Message = getMessageModel(connection);
            const ChatRequest = getChatRequestModel(connection);

            // Verify friendship exists and status is ACCEPTED
            const friendshipExists = await ChatRequest.findOne({
                $or: [
                    { 
                        from: senderId, 
                        to: receiverId,
                        fromRole: senderRole,
                        toRole: receiverRole,
                        status: 'ACCEPTED'
                    },
                    {
                        from: receiverId,
                        to: senderId,
                        fromRole: receiverRole,
                        toRole: senderRole,
                        status: 'ACCEPTED'
                    }
                ]
            });

            if (!friendshipExists) {
                console.error('Friendship verification failed:', {
                    senderId,
                    receiverId,
                    senderRole,
                    receiverRole
                });
                return res.status(403).json({ 
                    message: 'You must be friends to send messages',
                    error: 'FRIENDSHIP_NOT_FOUND'
                });
            }

            // Additional validation to ensure receiver exists
            const ReceiverModel = receiverRole === 'MANAGER' ? 
                getGymManagerModel(connection) : 
                getGymMemberModel(connection);
            
            const receiverExists = await ReceiverModel.findById(receiverId);
            if (!receiverExists) {
                return res.status(404).json({ 
                    message: 'Recipient not found',
                    error: 'RECIPIENT_NOT_FOUND'
                });
            }

            const newMessage = new Message({
                senderId,
                senderRole,
                receiverId,
                receiverRole,
                message
            });

            await newMessage.save();

            // Add sender/receiver info to response for frontend use
            const enrichedMessage = {
                ...newMessage.toObject(),
                sender: {
                    _id: senderId,
                    role: senderRole
                },
                receiver: {
                    _id: receiverId,
                    role: receiverRole
                }
            };

            console.log('Message sent successfully:', {
                messageId: enrichedMessage._id,
                senderId,
                receiverId
            });

            res.status(201).json(enrichedMessage);
        } catch (error) {
            console.error('Send message error:', error);
            res.status(500).json({ 
                message: 'Failed to send message',
                error: error.message 
            });
        }
    },

    // Get chat history
    getMessages: async (req, res) => {
        try {
            const { institutionName, friendId } = req.query;
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log('Fetching messages:', { userId, friendId });

            const connection = await connectToInstitutionDB(institutionName);
            const Message = getMessageModel(connection);
            const ChatRequest = getChatRequestModel(connection);

            // Verify friendship with specific roles
            const friendship = await ChatRequest.findOne({
                $or: [
                    { from: userId, to: friendId, status: 'ACCEPTED' },
                    { from: friendId, to: userId, status: 'ACCEPTED' }
                ]
            });

            if (!friendship) {
                return res.status(403).json({ 
                    message: 'You must be friends to view messages',
                    error: 'FRIENDSHIP_NOT_FOUND'
                });
            }

            // Get all messages between these users
            const messages = await Message.find({
                $or: [
                    { senderId: userId, receiverId: friendId },
                    { senderId: friendId, receiverId: userId }
                ]
            })
            .sort({ timeStamp: 1 })
            .lean(); // Use lean() for better performance

            // Enrich messages with sender/receiver info
            const enrichedMessages = messages.map(msg => ({
                ...msg,
                sender: {
                    _id: msg.senderId,
                    role: msg.senderRole
                },
                receiver: {
                    _id: msg.receiverId,
                    role: msg.receiverRole
                }
            }));

            console.log(`Found ${enrichedMessages.length} messages`);

            res.json(enrichedMessages);
        } catch (error) {
            console.error('Get messages error:', error);
            res.status(500).json({ 
                message: 'Failed to get messages',
                error: error.message 
            });
        }
    }
};