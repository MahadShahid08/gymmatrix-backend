// routes/memberAuth.routes.js
import express from 'express';
import { gymMemberAuthController } from '../controllers/memberAuthController.js';

const router = express.Router();

// Authentication routes
router.post('/register', gymMemberAuthController.registerMember);
router.post('/verify', gymMemberAuthController.verifyMember);
router.post('/login', gymMemberAuthController.login);

// Password reset routes
router.post('/reset-request', gymMemberAuthController.requestPasswordReset);
router.post('/reset-password', gymMemberAuthController.resetPassword);

// Token verification and logout
router.get('/verify-token', gymMemberAuthController.verifyToken);
router.post('/logout', gymMemberAuthController.logout);

export const MemberAuthRouter = router;