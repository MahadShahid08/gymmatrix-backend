import express from 'express';
import {forumController} from '../controllers/forumControllers.js'
import { gymManagerAuthController } from '../controllers/authController.js';
import { gymMemberAuthController } from '../controllers/memberAuthController.js';

const router = express.Router();

// Middleware to authenticate both managers and members
const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    try {
        // Try manager authentication first
        gymManagerAuthController.authenticateManager(req, res, (err) => {
            if (!err) return next(); // If manager auth succeeds, proceed

            // If manager auth fails, try member authentication
            gymMemberAuthController.authenticateMember(req, res, next);
        });
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(403).json({ message: "Invalid token" });
    }
};

// Apply authentication middleware to all forum routes
router.use(authenticateUser);

// Forum routes
router.get('/posts', forumController.getPosts);
router.post('/posts', forumController.createPost);
router.post('/posts/:postId/like', forumController.likePost);
router.post('/posts/:postId/unlike', forumController.unlikePost);
router.post('/posts/:postId/reply', forumController.replyToPost);
router.delete('/posts/:postId', forumController.deletePost);

export const ForumRouter = router;