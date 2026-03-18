/**
 * Rate Limiter Utility
 * ============================================================================
 * Handles rate limiting for external APIs (OpenRouter, etc.).
 *
 * Two layers of protection:
 *
 * 1. **Global rate limit state** (in-memory) — when a 429 is detected, all
 *    workers pause before retrying. This is the original behavior.
 *
 * 2. **Per-user concurrency semaphore** (Redis-backed) — limits the number of
 *    concurrent OpenRouter calls a single user can make. Prevents a user
 *    running multiple pipelines from overwhelming the API. Coordinates across
 *    all worker processes via Redis.
 */

import { v4 as uuid } from 'uuid';

// ============================================================================
// RATE LIMIT STATE (in-memory, per-process)
// ============================================================================

interface RateLimitState {
  isLimited: boolean;
  limitedUntil: number;
  service: string;
}

// Global rate limit state for each service
const rateLimitStates: Map<string, RateLimitState> = new Map();

// Default wait time if retry-after is not specified (60 seconds)
const DEFAULT_RETRY_AFTER_SECONDS = 60;

// ============================================================================
// RATE LIMIT DETECTION
// ============================================================================

/**
 * Check if an error is a rate limit error.
 */
function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded') ||
    message.includes('rate_limit_exceeded')
  );
}

/**
 * Extract retry-after time from error message (in seconds).
 */
function extractRetryAfter(error: Error): number {
  const message = error.message;
  
  // Try common patterns
  const patterns = [
    /retry.?after:?\s*(\d+)/i,
    /wait\s*(\d+)\s*seconds?/i,
    /try again in\s*(\d+)/i,
    /(\d+)\s*seconds?.*retry/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  
  return DEFAULT_RETRY_AFTER_SECONDS;
}

// ============================================================================
// RATE LIMIT MANAGEMENT
// ============================================================================

/**
 * Signal that a service has rate limited us.
 * @param service - Name of the service (e.g., 'openrouter', 'gpu-api')
 * @param retryAfterSeconds - Time to wait before retrying
 */
export function signalRateLimited(service: string, retryAfterSeconds: number = DEFAULT_RETRY_AFTER_SECONDS): void {
  const limitedUntil = Date.now() + (retryAfterSeconds * 1000);
  
  rateLimitStates.set(service, {
    isLimited: true,
    limitedUntil,
    service,
  });
  
  console.warn(`[RateLimiter] ${service} rate limited, pausing for ${retryAfterSeconds}s (until ${new Date(limitedUntil).toISOString()})`);
}

/**
 * Check if a service is currently rate limited.
 */
export function isServiceLimited(service: string): boolean {
  const state = rateLimitStates.get(service);
  if (!state) return false;
  
  if (state.limitedUntil <= Date.now()) {
    // Rate limit has expired
    rateLimitStates.delete(service);
    return false;
  }
  
  return true;
}

/**
 * Get remaining wait time for a rate-limited service (in milliseconds).
 */
export function getRemainingWaitTime(service: string): number {
  const state = rateLimitStates.get(service);
  if (!state) return 0;
  
  const remaining = state.limitedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Wait if a service is currently rate limited.
 * Returns immediately if not rate limited.
 */
export async function waitIfRateLimited(service: string = 'openrouter'): Promise<void> {
  const waitTime = getRemainingWaitTime(service);
  
  if (waitTime > 0) {
    console.log(`[RateLimiter] Waiting ${Math.ceil(waitTime / 1000)}s for ${service} rate limit to expire...`);
    await new Promise(r => setTimeout(r, waitTime));
    rateLimitStates.delete(service);
    console.log(`[RateLimiter] ${service} rate limit expired, resuming...`);
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handle an error that may be a rate limit error.
 * If it's a rate limit error, signals the rate limiter and returns true.
 * @param error - The error to handle
 * @param service - The service name
 * @returns true if it was a rate limit error, false otherwise
 */
export function handleRateLimitError(error: Error, service: string = 'openrouter'): boolean {
  if (isRateLimitError(error)) {
    const retryAfter = extractRetryAfter(error);
    signalRateLimited(service, retryAfter);
    return true;
  }
  return false;
}

// ============================================================================
// WRAPPER FUNCTION (legacy — global rate limit only)
// ============================================================================

/**
 * Execute an async operation with rate limit handling.
 * Automatically waits if rate limited and retries on rate limit errors.
 * 
 * @param operation - The async operation to execute
 * @param service - The service name for rate limit tracking
 * @param maxRetries - Maximum number of retries on rate limit errors
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * ```ts
 * const result = await withRateLimitHandling(
 *   async () => generateText(userId, systemPrompt, userPrompt),
 *   'openrouter',
 *   3
 * );
 * ```
 */
export async function withRateLimitHandling<T>(
  operation: () => Promise<T>,
  service: string = 'openrouter',
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Wait if currently rate limited
    await waitIfRateLimited(service);
    
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (handleRateLimitError(error, service)) {
          console.log(`[RateLimiter] Rate limit hit on attempt ${attempt + 1}/${maxRetries}, will retry...`);
          continue;
        }
      }
      
      // Not a rate limit error, throw immediately
      throw error;
    }
  }
  
  throw lastError || new Error(`Operation failed after ${maxRetries} retries due to rate limiting`);
}

// ============================================================================
// PER-USER CONCURRENCY SEMAPHORE (Redis-backed)
// ============================================================================

/**
 * Default max concurrent OpenRouter calls per user.
 * 15 is very lenient — a single pipeline peaks at ~5-10 concurrent calls.
 * This only kicks in if a user runs multiple pipelines simultaneously.
 */
const DEFAULT_MAX_CONCURRENT = 15;

/**
 * TTL for each semaphore slot in seconds.
 * If a process crashes without releasing, slots auto-expire.
 */
const SLOT_TTL_SECONDS = 120;

/**
 * Max time to wait for a slot before giving up (ms).
 */
const MAX_SLOT_WAIT_MS = 30_000;

/**
 * Redis key prefix for per-user semaphore sorted sets.
 */
const SEMAPHORE_KEY_PREFIX = 'or:semaphore:';

/**
 * Get the Redis connection lazily (avoids circular imports).
 * Returns null if Redis is not available (e.g., in API routes without workers).
 */
async function getRedis(): Promise<import('ioredis').default | null> {
  try {
    const { getRedisConnection } = await import('@/lib/queues/redis');
    return getRedisConnection();
  } catch {
    return null;
  }
}

/**
 * Acquire a concurrency slot for a user's OpenRouter calls.
 * If at capacity, waits with exponential backoff until a slot opens.
 *
 * @param userId - The user ID to throttle
 * @param maxConcurrent - Max concurrent calls (default: 15)
 * @returns A unique token to pass to `releaseSlot`
 */
export async function acquireSlot(
  userId: string,
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT
): Promise<string> {
  const redis = await getRedis();
  if (!redis) {
    // No Redis available — skip throttling (API routes without workers)
    return 'no-redis';
  }

  const key = `${SEMAPHORE_KEY_PREFIX}${userId}`;
  const token = uuid();
  const now = Date.now();
  const expireScore = now + SLOT_TTL_SECONDS * 1000;

  // Clean up expired slots first
  await redis.zremrangebyscore(key, '-inf', now);

  let waitMs = 0;
  const baseDelay = 200;
  let attempt = 0;

  while (waitMs < MAX_SLOT_WAIT_MS) {
    // Check current count
    const currentCount = await redis.zcard(key);

    if (currentCount < maxConcurrent) {
      // Add our slot with expiry score
      await redis.zadd(key, expireScore, token);
      // Set key TTL as a safety net
      await redis.expire(key, SLOT_TTL_SECONDS + 30);
      return token;
    }

    // At capacity — wait with exponential backoff
    const delay = Math.min(baseDelay * Math.pow(1.5, attempt), 5000);
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const actualDelay = Math.floor(delay + jitter);

    if (attempt === 0) {
      console.log(
        `[RateLimiter] User ${userId.substring(0, 8)}... at capacity (${currentCount}/${maxConcurrent}), waiting...`
      );
    }

    await new Promise(r => setTimeout(r, actualDelay));
    waitMs += actualDelay;
    attempt++;

    // Clean up expired slots on each retry
    await redis.zremrangebyscore(key, '-inf', Date.now());
  }

  // Timeout — proceed anyway to avoid blocking the pipeline
  console.warn(
    `[RateLimiter] User ${userId.substring(0, 8)}... slot acquisition timed out after ${MAX_SLOT_WAIT_MS}ms — proceeding without throttle`
  );
  return 'timeout-bypass';
}

/**
 * Release a concurrency slot for a user.
 *
 * @param userId - The user ID
 * @param token - The token returned by `acquireSlot`
 */
export async function releaseSlot(userId: string, token: string): Promise<void> {
  if (token === 'no-redis' || token === 'timeout-bypass') return;

  try {
    const redis = await getRedis();
    if (!redis) return;

    const key = `${SEMAPHORE_KEY_PREFIX}${userId}`;
    await redis.zrem(key, token);
  } catch (err) {
    // Non-critical — slot will auto-expire via TTL
    console.warn(`[RateLimiter] Failed to release slot for user ${userId.substring(0, 8)}...:`, err);
  }
}

/**
 * Execute an async operation within a per-user concurrency slot.
 * Automatically acquires and releases the slot.
 *
 * @param userId - The user ID to throttle
 * @param fn - The async operation to execute
 * @param maxConcurrent - Max concurrent calls per user (default: 15)
 * @returns The result of the operation
 *
 * @example
 * ```ts
 * const result = await withPerUserThrottle(userId, async () => {
 *   return callOpenRouter(userId, messages, config);
 * });
 * ```
 */
export async function withPerUserThrottle<T>(
  userId: string,
  fn: () => Promise<T>,
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT
): Promise<T> {
  const token = await acquireSlot(userId, maxConcurrent);
  try {
    return await fn();
  } finally {
    await releaseSlot(userId, token);
  }
}

// ============================================================================
// EXPONENTIAL BACKOFF UTILITY
// ============================================================================

/**
 * Calculate exponential backoff delay (useful for non-rate-limit retries).
 * @param attempt - The attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds with jitter
 */
export function calculateBackoff(attempt: number, baseDelayMs: number = 1000, maxDelayMs: number = 30000): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
