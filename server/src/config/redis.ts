import { Redis, RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

function getRedisOptions(): RedisOptions {
  let url = process.env.REDIS_URL;
  if (url) {
    url = url.trim().replace(/^["']|["']$/g, '');
    try {
      const parsed = new URL(url);
      const isUpstash = parsed.hostname.includes('upstash.io');
      const isTls = url.startsWith('rediss://') || isUpstash;

      console.log(`[Redis] Configured from REDIS_URL -> host: ${parsed.hostname}, port: ${parsed.port || 6379}, tls: ${isTls}`);

      return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        username: parsed.username || 'default',
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch (e: any) {
      console.warn('[Redis] Could not parse REDIS_URL, reason:', e.message);
    }
  }

  console.log(`[Redis] Using fallback host: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisConnectionOptions: RedisOptions = getRedisOptions();

export const redisClient = process.env.REDIS_URL
  ? new Redis(redisConnectionOptions)
  : new Redis(redisConnectionOptions);

redisClient.on('connect', () => {
  console.log('[Redis] Connected successfully to Redis server');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});
