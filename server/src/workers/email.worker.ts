import { Worker, Job } from 'bullmq';
import { redisConnectionOptions } from '../config/redis.js';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from '../queues/email.queue.js';
import { EmailService } from '../services/email.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';
import { prisma } from '../config/db.js';

const minDelayMs = Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS) || 2000;
const workerConcurrency = Number(process.env.WORKER_CONCURRENCY) || 5;

// Utility sleep function to enforce provider throttling
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { emailJobId, userId, senderId, recipient, subject, body } = job.data;
    console.log(`[Worker] Picked up Job ${job.id} for recipient: ${recipient}`);

    // Step 1: Provider throttling delay (mimics real-world safe sending pacing)
    if (minDelayMs > 0) {
      await sleep(minDelayMs);
    }

    // Step 2: Mark job as PROCESSING in PostgreSQL
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'PROCESSING' },
    });
    await ElasticsearchService.updateEmailStatus(emailJobId, 'PROCESSING');

    // Step 3: Check hourly rate limit per sender
    const rateCheck = await RateLimiterService.checkAndIncrement(senderId, userId);

    if (!rateCheck.allowed) {
      console.warn(
        `[Worker] Sender ${senderId} exceeded hourly rate limit. Rescheduling Job ${job.id} by ${rateCheck.delayMs}ms to ${rateCheck.nextWindowDate?.toISOString()}`
      );

      // Update Postgres & Elasticsearch status to DELAYED_RATE_LIMIT
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'DELAYED_RATE_LIMIT',
          scheduledAt: rateCheck.nextWindowDate || new Date(),
        },
      });
      await ElasticsearchService.updateEmailStatus(emailJobId, 'DELAYED_RATE_LIMIT');

      // Reschedule into BullMQ for the next available hour window
      await emailQueue.add(
        'send-scheduled-email',
        job.data,
        {
          jobId: `${emailJobId}-rescheduled-${Date.now()}`,
          delay: rateCheck.delayMs || 3600000,
        }
      );

      return {
        status: 'delayed_rate_limit',
        rescheduledFor: rateCheck.nextWindowDate,
      };
    }

    // Step 4: Dispatch email via SMTP (Ethereal)
    try {
      const { messageId, previewUrl } = await EmailService.sendEmail({
        senderId,
        recipient,
        subject,
        body,
      });

      console.log(`[Worker] Sent email ${messageId} to ${recipient}. Preview: ${previewUrl}`);

      // Step 5: Update Postgres & Elasticsearch to SENT
      const sentTime = new Date();
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: sentTime,
          etherealPreviewUrl: previewUrl,
        },
      });

      await ElasticsearchService.updateEmailStatus(emailJobId, 'SENT', sentTime.toISOString());

      return {
        status: 'sent',
        messageId,
        previewUrl,
      };
    } catch (error: any) {
      console.error(`[Worker] Delivery failed for job ${job.id}:`, error.message);

      // If this was the last attempt, mark as permanently FAILED
      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: {
            status: 'FAILED',
            failedReason: error.message,
          },
        });
        await ElasticsearchService.updateEmailStatus(emailJobId, 'FAILED');
      }

      throw error; // Re-throw to trigger BullMQ exponential backoff if retries left
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: workerConcurrency,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] Completed job ${job.id}`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
});
