import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { emailQueue } from '../queues/email.queue.js';
import { emailDlq } from '../queues/dlq.queue.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const scheduleSchema = z.object({
  senderId: z.string().uuid(),
  recipients: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  startTime: z.string().datetime().optional(), // ISO string
  delayBetweenEmailsMs: z.number().min(0).default(2000), // Default 2s delay
});

export class EmailController {
  /**
   * Schedule one or more emails with sequential delay pacing
   */
  static async scheduleEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const parseResult = scheduleSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.format() });
        return;
      }

      const { senderId, recipients, subject, body, startTime, delayBetweenEmailsMs } = parseResult.data;

      // Verify sender exists and belongs to user
      const sender = await prisma.senderAccount.findFirst({
        where: { id: senderId, userId },
      });

      if (!sender) {
        res.status(404).json({ error: 'Sender account not found or does not belong to user' });
        return;
      }

      const now = Date.now();
      const baseTime = startTime ? Math.max(now, new Date(startTime).getTime()) : now;

      const createdJobs = [];

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const scheduledTime = new Date(baseTime + i * delayBetweenEmailsMs);
        const delay = Math.max(0, scheduledTime.getTime() - Date.now());

        // 1. Create record in PostgreSQL
        const emailRecord = await prisma.emailJob.create({
          data: {
            userId,
            senderId,
            recipient,
            subject,
            body,
            status: 'SCHEDULED',
            scheduledAt: scheduledTime,
          },
        });

        // 2. Add to BullMQ delayed queue (jobId = emailRecord.id for idempotency)
        const bullJob = await emailQueue.add(
          'send-scheduled-email',
          {
            emailJobId: emailRecord.id,
            userId,
            senderId,
            recipient,
            subject,
            body,
            scheduledAt: scheduledTime.toISOString(),
          },
          {
            jobId: emailRecord.id, // Idempotent key
            delay, // Milliseconds until BullMQ promotes from delayed to active
          }
        );

        // Update with bullJobId
        await prisma.emailJob.update({
          where: { id: emailRecord.id },
          data: { bullJobId: bullJob.id },
        });

        // 3. Index in Elasticsearch for instant search
        await ElasticsearchService.indexEmail({
          id: emailRecord.id,
          userId,
          senderId,
          recipient,
          subject,
          body,
          status: 'SCHEDULED',
          scheduledAt: scheduledTime.toISOString(),
          createdAt: emailRecord.createdAt.toISOString(),
        });

        createdJobs.push({
          id: emailRecord.id,
          recipient,
          scheduledAt: scheduledTime,
          bullJobId: bullJob.id,
        });
      }

      res.status(201).json({
        message: `Successfully scheduled ${createdJobs.length} email(s)`,
        count: createdJobs.length,
        jobs: createdJobs,
      });
    } catch (err: any) {
      console.error('[EmailController] Error scheduling emails:', err.message);
      res.status(500).json({ error: 'Failed to schedule emails', details: err.message });
    }
  }

  /**
   * Get list of scheduled/pending emails
   */
  static async getScheduledEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 50 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [total, emails] = await Promise.all([
        prisma.emailJob.count({
          where: {
            userId,
            status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING', 'DELAYED_RATE_LIMIT'] },
          },
        }),
        prisma.emailJob.findMany({
          where: {
            userId,
            status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING', 'DELAYED_RATE_LIMIT'] },
          },
          include: { sender: { select: { name: true, email: true } } },
          orderBy: { scheduledAt: 'asc' },
          skip,
          take,
        }),
      ]);

      res.json({ total, page: Number(page), limit: take, emails });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch scheduled emails', details: err.message });
    }
  }

  /**
   * Get list of sent and failed emails
   */
  static async getSentEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 50 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [total, emails] = await Promise.all([
        prisma.emailJob.count({
          where: {
            userId,
            status: { in: ['SENT', 'FAILED'] },
          },
        }),
        prisma.emailJob.findMany({
          where: {
            userId,
            status: { in: ['SENT', 'FAILED'] },
          },
          include: { sender: { select: { name: true, email: true } } },
          orderBy: { sentAt: 'desc' },
          skip,
          take,
        }),
      ]);

      res.json({ total, page: Number(page), limit: take, emails });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch sent emails', details: err.message });
    }
  }

  /**
   * Full-text search across emails via Elasticsearch
   */
  static async searchEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { q, status, from = 0, size = 20 } = req.query;

      const results = await ElasticsearchService.searchEmails({
        userId,
        query: q ? String(q) : undefined,
        status: status ? String(status) : undefined,
        from: Number(from),
        size: Number(size),
      });

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: 'Search failed', details: err.message });
    }
  }

  /**
   * Get quarantined jobs in the Dead Letter Queue
   */
  static async getDlqJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const dlqJobs = await emailDlq.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 50);
      const userDlqJobs = dlqJobs
        .filter((job) => job?.data?.userId === userId)
        .map((job) => ({
          dlqJobId: job.id,
          originalJobId: job.data.originalJobId,
          emailJobId: job.data.emailJobId,
          recipient: job.data.recipient,
          subject: job.data.subject,
          errorReason: job.data.errorReason,
          failedAt: job.data.failedAt,
          attemptsMade: job.data.attemptsMade,
        }));

      res.json({
        total: userDlqJobs.length,
        jobs: userDlqJobs,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch DLQ jobs', details: err.message });
    }
  }

  /**
   * Replay/Retry a quarantined DLQ job back into the primary scheduling queue
   */
  static async retryDlqJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { jobId } = req.params;

      const job = await emailDlq.getJob(jobId);
      if (!job || job.data?.userId !== userId) {
        res.status(404).json({ error: 'DLQ job not found or does not belong to user' });
        return;
      }

      const { emailJobId, senderId, recipient, subject, body } = job.data;

      // Reset PostgreSQL status to SCHEDULED
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SCHEDULED',
          failedReason: null,
          scheduledAt: new Date(),
        },
      });

      // Re-enqueue into primary BullMQ email queue
      const replayedBullJob = await emailQueue.add(
        'send-scheduled-email',
        {
          emailJobId,
          userId,
          senderId,
          recipient,
          subject,
          body,
          scheduledAt: new Date().toISOString(),
        },
        {
          jobId: `${emailJobId}-replay-${Date.now()}`,
          delay: 0,
        }
      );

      // Remove from DLQ
      await job.remove();

      res.json({
        message: 'Successfully replayed DLQ job into primary scheduler queue',
        newJobId: replayedBullJob.id,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to replay DLQ job', details: err.message });
    }
  }
}
