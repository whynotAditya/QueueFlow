import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticateJwt } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/google', AuthController.googleLogin);
router.post('/dev-login', AuthController.devLogin);
router.get('/me', authenticateJwt, AuthController.getMe);

export default router;
