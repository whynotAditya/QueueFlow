import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../config/redis.js';

export const EMAIL_DLQ_NAME = 'email-dlq';

export interface EmailDlqJobData {
  originalJobId?: string;
  emailJobId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  errorReason: string;
  failedAt: string;
  attemptsMade: number;
}

export const emailDlq = new Queue<EmailDlqJobData>(EMAIL_DLQ_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    // Preserve poison pill jobs indefinitely for debugging, audit, and manual replay
    removeOnComplete: false,
    removeOnFail: false,
  },
});
