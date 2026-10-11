import { Router } from 'express';
import { SlackController } from '../controllers/slack.controller.js';
import { authenticateJwt } from '../middleware/auth.middleware.js';

const router = Router();

// OAuth callback is redirected from Slack browser without Bearer token
router.get('/oauth/callback', SlackController.handleCallback);

// Protected routes
router.get('/oauth-url', authenticateJwt, SlackController.getOAuthUrl);
router.get('/status', authenticateJwt, SlackController.getStatus);
router.post('/webhook', authenticateJwt, SlackController.connectWebhook);
router.post('/test-alert', authenticateJwt, SlackController.testAlert);
router.post('/disconnect', authenticateJwt, SlackController.disconnect);

export default router;
