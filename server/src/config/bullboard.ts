import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/email.queue.js';
import { emailDlq } from '../queues/dlq.queue.js';

export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(emailDlq),
  ],
  serverAdapter,
});

serverAdapter.setErrorHandler((error: any) => {
  console.error('[BullBoard API Error]:', error?.message || error);
  return {
    status: 500,
    body: {
      error: 'Bull Board Internal Error',
      message: error?.message || 'Unknown queue error',
      hint: error?.message?.includes('WRONGPASS')
        ? 'Redis authentication failed: check REDIS_URL in Render Environment settings'
        : error?.message?.includes('ECONNREFUSED')
        ? 'Connection refused: Redis is not reachable on the configured host/port'
        : 'Verify REDIS_URL connection and TLS options',
    },
  };
});
