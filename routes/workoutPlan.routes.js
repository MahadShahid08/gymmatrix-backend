import express from 'express';
import { workoutPlanController } from '../controllers/workoutPlanController.js';

const router = express.Router();

// Member routes
router.post('/create', workoutPlanController.createPlan);
router.get('/member-plans/:institutionName', workoutPlanController.getPlans);

// Manager routes
router.post('/comment', workoutPlanController.addManagerComment);
router.get('/pending/:institutionName', workoutPlanController.getPendingPlans);
router.post('/approve', workoutPlanController.approvePlan);

export const WorkoutPlanRouter = router;