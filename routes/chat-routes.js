// routes/chat.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';  // Add this import
import { chatController } from '../controllers/ChatController.js';

const router = express.Router();

// Middleware to authenticate either manager or member
const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(403).json({ message: "Invalid token" });
    }
};

// Chat routes
router.get('/users/:institutionName', authenticateUser, chatController.getAllUsers);
router.post('/request', authenticateUser, chatController.sendRequest);
router.get('/requests/:institutionName', authenticateUser, chatController.getRequests);
router.post('/request/handle', authenticateUser, chatController.handleRequest);
router.get('/friends/:institutionName', authenticateUser, chatController.getFriends);
router.post('/message', authenticateUser, chatController.sendMessage);
router.get('/messages', authenticateUser, chatController.getMessages);

export { router as ChatRouter };