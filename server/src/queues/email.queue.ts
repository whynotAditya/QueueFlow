import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../config/redis.js';

export const EMAIL_QUEUE_NAME = 'email-scheduler-queue';

export interface EmailJobData {
  emailJobId: string; // Postgres UUID (also used as BullMQ Job ID for idempotency)
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs in Redis for inspection
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
    },
  },
});
