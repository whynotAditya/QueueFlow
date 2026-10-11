import { Router } from 'express';
import { SenderController } from '../controllers/sender.controller.js';
import { authenticateJwt } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/', SenderController.listSenders);
router.post('/ethereal', SenderController.createEtherealSender);

export default router;
