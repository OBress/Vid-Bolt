/**
 * Redis Connection Module
 * ============================================================================
 * Provides a singleton Redis connection for BullMQ queues and workers.
 * Automatically detects Railway Redis (via REDIS_URL) or falls back to local.
 */

import Redis, { type RedisOptions } from 'ioredis';

function getRedisConfig(): RedisOptions {
  // Railway provides REDIS_URL environment variable
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    // Production: Railway Redis (parse connection string)
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
      password: url.password || undefined,
      username: url.username || undefined,
      // Enable TLS for secure connections (rediss://)
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      // Required for BullMQ compatibility
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
  
  // Local development: Docker Redis or local Redis
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

// Singleton connection for BullMQ
let redisConnection: Redis | null = null;

/**
 * Get the shared Redis connection for BullMQ.
 * Creates a new connection if one doesn't exist.
 */
export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const config = getRedisConfig();
    console.log(`[Redis] Connecting to ${config.host}:${config.port}${config.tls ? ' (TLS)' : ''}`);
    
    redisConnection = new Redis(config);
    
    redisConnection.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
    
    redisConnection.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
    
    redisConnection.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    redisConnection.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });
  }
  
  return redisConnection;
}

/**
 * Close the Redis connection gracefully.
 * Call this during application shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    console.log('[Redis] Closing connection...');
    await redisConnection.quit();
    redisConnection = null;
    console.log('[Redis] Connection closed');
  }
}

/**
 * Check if Redis is connected and ready.
 */
export async function isRedisReady(): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
