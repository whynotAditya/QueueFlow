import { Redis, RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redisConnectionOptions: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
  enableReadyCheck: false,
};

// Singleton Redis client for application commands (e.g. rate limiter counters)
export const redisClient = new Redis(redisConnectionOptions);

redisClient.on('connect', () => {
  console.log('[Redis] Connected successfully to Redis server');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});
