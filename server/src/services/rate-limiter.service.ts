import { redisClient } from '../config/redis.js';
import { SlackService } from './slack.service.js';
import { prisma } from '../config/db.js';

export class RateLimiterService {
  /**
   * Generates the hour window key for a sender. Format: rate:sender:{senderId}:YYYY-MM-DD-HH
   */
  private static getHourKey(senderId: string, date: Date = new Date()): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    return `rate:sender:${senderId}:${y}-${m}-${d}-${h}`;
  }

  /**
   * Computes remaining milliseconds until the start of the next UTC hour window
   */
  private static getNextHourWindow(): { delayMs: number; nextWindowDate: Date } {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);

    const delayMs = Math.max(1000, nextHour.getTime() - now.getTime() + 1000); // 1s buffer into next hour
    return { delayMs, nextWindowDate: nextHour };
  }

  /**
   * Checks if sender has capacity in the current hour window and increments counter atomically
   */
  static async checkAndIncrement(senderId: string, userId: string): Promise<{
    allowed: boolean;
    currentCount: number;
    delayMs?: number;
    nextWindowDate?: Date;
  }> {
    const maxHourly = Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200;
    const key = this.getHourKey(senderId);

    // Atomically increment the counter for this hour window
    const currentCount = await redisClient.incr(key);

    // If it's the first key access in this hour window, set TTL to 70 minutes
    if (currentCount === 1) {
      await redisClient.expire(key, 4200);
    }

    if (currentCount > maxHourly) {
      const { delayMs, nextWindowDate } = this.getNextHourWindow();

      // Trigger Slack notification once per hour window
      const alertKey = `slack_alert_sent:${key}`;
      const alreadyAlerted = await redisClient.set(alertKey, '1', 'EX', 3600, 'NX');

      if (alreadyAlerted) {
        // Fetch sender details for Slack alert
        const sender = await prisma.senderAccount.findUnique({
          where: { id: senderId },
          select: { email: true },
        });

        await SlackService.notifyRateLimitHit({
          userId,
          senderEmail: sender?.email || senderId,
          limit: maxHourly,
          nextAvailableWindow: nextWindowDate,
        });
      }

      return {
        allowed: false,
        currentCount,
        delayMs,
        nextWindowDate,
      };
    }

    return {
      allowed: true,
      currentCount,
    };
  }
}
