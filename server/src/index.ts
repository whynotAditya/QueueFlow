import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { serverAdapter } from './config/bullboard.js';
import { initElasticsearchIndex } from './config/elasticsearch.js';
import { redisClient, redisConnectionOptions } from './config/redis.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import senderRoutes from './routes/sender.routes.js';
import emailRoutes from './routes/email.routes.js';
import slackRoutes from './routes/slack.routes.js';

// Import worker to start listening to queue jobs
import './workers/email.worker.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS setup
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// Bull Board UI for queue monitoring
app.use('/admin/queues', serverAdapter.getRouter());

// Application API routes
app.use('/api/auth', authRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/slack', slackRoutes);

// Health check endpoint with Redis diagnostics
app.get('/health', async (req, res) => {
  let redisStatus = 'checking...';
  let redisError: string | null = null;

  try {
    const pong = await redisClient.ping();
    redisStatus = `connected (${pong})`;
  } catch (err: any) {
    redisStatus = 'failed';
    redisError = err.message;
  }

  res.json({
    status: 'ok',
    service: 'QueueFlow Backend',
    redis: {
      status: redisStatus,
      error: redisError,
      configuredHost: redisConnectionOptions.host,
      isTls: !!redisConnectionOptions.tls,
      hasRedisUrlEnv: !!process.env.REDIS_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[QueueFlow Error]', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  const isWrongPass = err?.message?.includes('WRONGPASS');
  res.status(500).json({
    error: 'Internal Server Error',
    message: err?.message || 'Unknown error occurred',
    hint: isWrongPass
      ? 'Redis authentication failed (WRONGPASS). Check REDIS_URL in environment variables.'
      : undefined,
  });
});

// Initialize search engine and start HTTP server
async function startServer() {
  try {
    await initElasticsearchIndex();
  } catch (err: any) {
    console.warn('[Elasticsearch] Could not initialize index on startup:', err.message);
  }

  app.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 QueueFlow Server running on http://localhost:${port}`);
    console.log(`📊 BullMQ Live Dashboard at http://localhost:${port}/admin/queues`);
    console.log(`=======================================================`);
  });
}

startServer();
