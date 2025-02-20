// routes/attendance-routes.js
import express from 'express';
import { attendanceController } from '../controllers/attendanceController.js';
import { gymManagerAuthController } from '../controllers/authController.js';
import { gymMemberAuthController } from '../controllers/memberAuthController.js';

const router = express.Router();

// Member routes
router.post('/check-in', gymMemberAuthController.authenticateMember, attendanceController.checkIn);
router.post('/check-out', gymMemberAuthController.authenticateMember, attendanceController.checkOut);
router.get('/history', gymMemberAuthController.authenticateMember, attendanceController.getAttendanceHistory);
router.get('/status', gymMemberAuthController.authenticateMember, attendanceController.getAttendanceStatus);

// Manager routes
router.get('/overview', gymManagerAuthController.authenticateManager, attendanceController.getAttendanceOverview);
router.get('/member/:memberId', gymManagerAuthController.authenticateManager, attendanceController.getMemberAttendance);
router.get('/daily-report', gymManagerAuthController.authenticateManager, attendanceController.getDailyReport);
router.get('/monthly-report', gymManagerAuthController.authenticateManager, attendanceController.getMonthlyReport);

export const AttendanceRouter = router;