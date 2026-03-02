/**
 * GPU Lock — Per-User Distributed Mutex
 * ============================================================================
 * Ensures only one GPU batch operation runs at a time per user.
 * Uses Redis SET NX EX for distributed locking with auto-expiry safety.
 *
 * Why: Each user has a single GPU VM with one VRAM mode at a time.
 * Without serialization, concurrent pipelines fight over VRAM mode
 * (image ↔ video thrashing) and corrupt each other's generation batches.
 *
 * Multi-user: Each user gets an independent lock key (`gpu-lock:{userId}`).
 * Intra-user: The second pipeline's GPU phase waits until the first finishes.
 */

import { getRedisConnection } from './redis';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How often to poll for lock availability (ms) */
const POLL_INTERVAL_MS = 2_000;

/** Default max lock TTL — safety net if worker crashes (30 minutes) */
const DEFAULT_MAX_LOCK_TTL_MS = 30 * 60 * 1_000;

/** Minimum lock TTL to prevent overly aggressive expiry */
const MIN_LOCK_TTL_MS = 60_000;

const LOG_PREFIX = '[GPU Lock]';

// ============================================================================
// LOCK FUNCTIONS
// ============================================================================

/**
 * Acquire a per-user GPU lock. Blocks (polls) until the lock is available.
 *
 * @param userId   - User whose GPU VM to lock
 * @param ttlMs    - Lock auto-expiry TTL in ms (safety net for crashes)
 * @param abortSignal - Optional AbortSignal to cancel waiting
 * @returns Lock token (needed for release)
 * @throws If unable to acquire within ttlMs or if aborted
 */
export async function acquireGpuLock(
  userId: string,
  ttlMs: number = DEFAULT_MAX_LOCK_TTL_MS,
  abortSignal?: AbortSignal,
): Promise<string> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;
  const token = uuidv4();
  const ttlSeconds = Math.max(Math.ceil(Math.max(ttlMs, MIN_LOCK_TTL_MS) / 1000), 60);
  const deadline = Date.now() + ttlMs;

  console.log(`${LOG_PREFIX} Attempting to acquire lock for user ${userId} (TTL: ${ttlSeconds}s)`);

  while (Date.now() < deadline) {
    if (abortSignal?.aborted) {
      throw new Error(`${LOG_PREFIX} Lock acquisition aborted for user ${userId}`);
    }

    // SET key token NX EX ttl — only sets if key doesn't exist
    const result = await redis.set(lockKey, token, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      console.log(`${LOG_PREFIX} Acquired lock for user ${userId} (token: ${token.slice(0, 8)}...)`);
      return token;
    }

    // Lock held by another job — wait and retry
    const ttl = await redis.ttl(lockKey);
    console.log(
      `${LOG_PREFIX} Lock held for user ${userId}, waiting... (lock TTL: ${ttl}s, deadline in ${Math.round((deadline - Date.now()) / 1000)}s)`
    );

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `${LOG_PREFIX} Timed out waiting for GPU lock for user ${userId} after ${Math.round(ttlMs / 1000)}s`
  );
}

/**
 * Release a per-user GPU lock. Only releases if the token matches
 * (prevents accidental release by a different job).
 *
 * Uses a Lua script for atomic check-and-delete.
 */
export async function releaseGpuLock(userId: string, token: string): Promise<boolean> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;

  // Atomic: only delete if the value matches our token
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(luaScript, 1, lockKey, token);

  if (result === 1) {
    console.log(`${LOG_PREFIX} Released lock for user ${userId} (token: ${token.slice(0, 8)}...)`);
    return true;
  }

  console.warn(
    `${LOG_PREFIX} Lock release failed for user ${userId} — token mismatch or lock expired`
  );
  return false;
}

/**
 * Convenience wrapper: acquire lock, run fn, guarantee release.
 *
 * @param userId - User whose GPU VM to lock
 * @param fn     - Async function to run while holding the lock
 * @param ttlMs  - Lock auto-expiry TTL (should exceed expected fn duration)
 * @returns Result of fn
 */
export async function withGpuLock<T>(
  userId: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_MAX_LOCK_TTL_MS,
): Promise<T> {
  const token = await acquireGpuLock(userId, ttlMs);

  try {
    return await fn();
  } finally {
    await releaseGpuLock(userId, token);
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Check if a user's GPU lock is currently held (for monitoring/debugging).
 */
export async function isGpuLockHeld(userId: string): Promise<{ held: boolean; ttl: number }> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;
  const ttl = await redis.ttl(lockKey);

  return {
    held: ttl > 0,
    ttl: Math.max(0, ttl),
  };
}
