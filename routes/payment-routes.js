// routes/payment.routes.js
import express from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { gymManagerAuthController } from '../controllers/authController.js';

const router = express.Router();

// All routes require manager authentication
router.use(gymManagerAuthController.authenticateManager);

// Get all members with payment status
router.get('/members', paymentController.getAllMembersPaymentStatus);

// Get specific member's payment details
router.get('/members/:memberId', paymentController.getMemberPaymentDetails);

// Update payment status
router.put('/members/:memberId/status', paymentController.updatePaymentStatus);

// Update member fees
router.put('/members/:memberId/fees', paymentController.updateMemberFees);

// Get payment statistics
router.get('/statistics', paymentController.getPaymentStatistics);

export const PaymentRouter = router;