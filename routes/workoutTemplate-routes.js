import express from 'express';
import { workoutTemplateController } from '../controllers/workoutTemplateController.js';
import { gymManagerAuthController } from '../controllers/authController.js';
import { gymMemberAuthController } from '../controllers/memberAuthController.js';

const router = express.Router();

// Manager routes (protected by manager authentication)
router.get(
    '/personal-training-members',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.getPersonalTrainingMembers
);

router.get(
    '/member-history/:memberId',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.getMemberTemplateHistory
);

router.post(
    '/create',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.createTemplate
);

router.get(
    '/trainer-templates',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.getTrainerTemplates
);

router.put(
    '/:templateId',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.updateTemplate
);

router.delete(
    '/:templateId',
    gymManagerAuthController.authenticateManager,
    workoutTemplateController.deleteTemplate
);

// Member routes (protected by member authentication)
router.get(
    '/member-template',
    gymMemberAuthController.authenticateMember,
    workoutTemplateController.getMemberTemplate
);

// Shared routes (accessible by both manager and member)
router.get(
    '/:templateId',
    (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "No token provided" });
        }

        gymManagerAuthController.authenticateManager(req, res, (err) => {
            if (err) {
                gymMemberAuthController.authenticateMember(req, res, next);
            } else {
                next();
            }
        });
    },
    workoutTemplateController.getTemplateById
);
router.patch(
  '/:templateId/status',
  gymManagerAuthController.authenticateManager,
  workoutTemplateController.setTemplateStatus
);

export const WorkoutTemplateRouter = router;