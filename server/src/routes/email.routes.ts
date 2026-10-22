import { Router } from 'express';
import { EmailController } from '../controllers/email.controller.js';
import { authenticateJwt } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateJwt);

router.post('/schedule', EmailController.scheduleEmails);
router.get('/scheduled', EmailController.getScheduledEmails);
router.get('/sent', EmailController.getSentEmails);
router.get('/search', EmailController.searchEmails);
router.get('/dlq', EmailController.getDlqJobs);
router.post('/dlq/:jobId/retry', EmailController.retryDlqJob);

export default router;
