import { Request, Response } from 'express';
import { SlackService } from '../services/slack.service.js';
import { prisma } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export class SlackController {
  /**
   * Returns Slack OAuth authorization URL
   */
  static getOAuthUrl(req: AuthenticatedRequest, res: Response): void {
    const userId = req.user!.id;
    const url = SlackService.getOAuthUrl(userId);
    res.json({ url });
  }

  /**
   * OAuth callback handler redirected from Slack
   */
  static async handleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state: userId, error } = req.query;

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

      if (error) {
        res.redirect(`${clientUrl}/dashboard?slack_error=${encodeURIComponent(String(error))}`);
        return;
      }

      if (!code || !userId) {
        res.redirect(`${clientUrl}/dashboard?slack_error=missing_code_or_user`);
        return;
      }

      await SlackService.handleOAuthCallback(String(code), String(userId));
      res.redirect(`${clientUrl}/dashboard?slack_connected=true`);
    } catch (err: any) {
      console.error('[Slack] OAuth callback error:', err.message);
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      res.redirect(`${clientUrl}/dashboard?slack_error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Get current user's Slack integration status
   */
  static async getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const integration = await prisma.slackIntegration.findUnique({
        where: { userId },
        select: {
          isActive: true,
          channelName: true,
          channelId: true,
          createdAt: true,
        },
      });

      res.json({ connected: !!integration?.isActive, integration });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch Slack status', details: err.message });
    }
  }

  /**
   * Send a test Slack notification to verify integration in real-time
   */
  static async testAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const nextHour = new Date(Date.now() + 3600000);

      const success = await SlackService.notifyRateLimitHit({
        userId,
        senderEmail: 'test-sender@ethereal.email',
        limit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200,
        nextAvailableWindow: nextHour,
      });

      if (!success) {
        res.status(400).json({
          error: 'Could not send alert. Make sure Slack is connected in your dashboard.',
        });
        return;
      }

      res.json({ message: 'Live Slack rate-limit alert sent successfully!' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to trigger test alert', details: err.message });
    }
  }

  /**
   * Disconnect Slack
   */
  static async disconnect(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      await prisma.slackIntegration.deleteMany({
        where: { userId },
      });

      res.json({ message: 'Slack disconnected successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to disconnect Slack', details: err.message });
    }
  }
}
