import { WebClient } from '@slack/web-api';
import { prisma } from '../config/db.js';

export class SlackService {
  /**
   * Generates the Slack OAuth URL for workspace installation
   */
  static getOAuthUrl(stateUserId: string): string {
    const clientId = process.env.SLACK_CLIENT_ID || '';
    const redirectUri = encodeURIComponent(process.env.SLACK_REDIRECT_URI || '');
    const scopes = encodeURIComponent('incoming-webhook,chat:write');

    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${stateUserId}`;
  }

  /**
   * Completes OAuth flow: exchanges code for access token and incoming webhook
   */
  static async handleOAuthCallback(code: string, userId: string): Promise<void> {
    const client = new WebClient();

    const response = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI!,
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth failed: ${response.error}`);
    }

    const accessToken = response.access_token as string;
    const webhook = response.incoming_webhook;

    await prisma.slackIntegration.upsert({
      where: { userId },
      update: {
        accessToken,
        incomingWebhookUrl: webhook?.url || null,
        channelId: webhook?.channel_id || null,
        channelName: webhook?.channel || null,
        isActive: true,
      },
      create: {
        userId,
        accessToken,
        incomingWebhookUrl: webhook?.url || null,
        channelId: webhook?.channel_id || null,
        channelName: webhook?.channel || null,
        isActive: true,
      },
    });
  }

  /**
   * Sends an alert notification to Slack when a sender account hits its hourly rate limit
   */
  static async notifyRateLimitHit(params: {
    userId: string;
    senderEmail: string;
    limit: number;
    nextAvailableWindow: Date;
  }): Promise<boolean> {
    const { userId, senderEmail, limit, nextAvailableWindow } = params;

    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
    });

    // If user hasn't connected Slack or integration is inactive, silently skip without crash
    if (!integration || !integration.isActive) {
      return false;
    }

    const messageText = `⚠️ *[QueueFlow Alert] Rate Limit Reached!*\n` +
      `• *Sender:* \`${senderEmail}\`\n` +
      `• *Hourly Limit:* ${limit} emails/hour\n` +
      `• *Action Taken:* Incoming emails automatically delayed until next window.\n` +
      `• *Next Window Resumes:* <!date^${Math.floor(nextAvailableWindow.getTime() / 1000)}^{date_num} {time_secs}|${nextAvailableWindow.toISOString()}>`;

    try {
      if (integration.incomingWebhookUrl) {
        // Post via incoming webhook
        await fetch(integration.incomingWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: messageText }),
        });
      } else if (integration.accessToken && integration.channelId) {
        // Post via WebClient
        const client = new WebClient(integration.accessToken);
        await client.chat.postMessage({
          channel: integration.channelId,
          text: messageText,
        });
      }
      console.log(`[Slack] Successfully notified user ${userId} of rate limit hit.`);
      return true;
    } catch (err: any) {
      console.error(`[Slack] Failed to send notification to user ${userId}:`, err.message);
      return false;
    }
  }
}
