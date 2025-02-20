import express from 'express';
import { gymManagerAuthController } from '../controllers/authController.js';

const router = express.Router();

// Registration and authentication routes
router.post('/register', gymManagerAuthController.registerManager);
router.post('/verify', gymManagerAuthController.verifyManager);
router.post('/login', gymManagerAuthController.login);

// Password reset routes
router.post('/reset-request', gymManagerAuthController.requestPasswordReset);
router.post('/reset-password', gymManagerAuthController.resetPassword);

// Token verification and logout
router.get('/verify-token', gymManagerAuthController.verifyToken);
router.post('/logout', gymManagerAuthController.logout);

export const AuthRouter = router;