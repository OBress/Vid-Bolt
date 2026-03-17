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
 * @param videoId  - Optional videoId to associate with the lock (for safe per-video release)
 * @returns Lock token (needed for release)
 * @throws If unable to acquire within ttlMs or if aborted
 */
export async function acquireGpuLock(
  userId: string,
  ttlMs: number = DEFAULT_MAX_LOCK_TTL_MS,
  abortSignal?: AbortSignal,
  videoId?: string,
): Promise<string> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;
  const token = uuidv4();
  // Store token:videoId as the lock value so we can release per-video
  const lockValue = videoId ? `${token}:${videoId}` : token;
  const ttlSeconds = Math.max(Math.ceil(Math.max(ttlMs, MIN_LOCK_TTL_MS) / 1000), 60);
  const deadline = Date.now() + ttlMs;

  console.log(`${LOG_PREFIX} Attempting to acquire lock for user ${userId} (TTL: ${ttlSeconds}s${videoId ? `, video: ${videoId.slice(0, 8)}...` : ''})`);

  let lastLogTime = 0;
  let pollsSinceLastLog = 0;

  while (Date.now() < deadline) {
    if (abortSignal?.aborted) {
      throw new Error(`${LOG_PREFIX} Lock acquisition aborted for user ${userId}`);
    }

    // SET key lockValue NX EX ttl — only sets if key doesn't exist
    const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      console.log(`${LOG_PREFIX} Acquired lock for user ${userId} (token: ${token.slice(0, 8)}...${videoId ? `, video: ${videoId.slice(0, 8)}...` : ''})`);
      return token;
    }

    // Lock held by another job — wait and retry
    // Only log every 30s to avoid spamming (polls every 2s = ~15 polls per log)
    pollsSinceLastLog++;
    const now = Date.now();
    if (now - lastLogTime >= 30_000) {
      const ttl = await redis.ttl(lockKey);
      const deadlineIn = Math.round((deadline - now) / 1000);
      console.log(
        `${LOG_PREFIX} Waiting for lock (user: ${userId.slice(0, 8)}..., lock TTL: ${ttl}s, deadline in ${deadlineIn}s, polls: ${pollsSinceLastLog})`
      );
      lastLogTime = now;
      pollsSinceLastLog = 0;
    }

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
 * Handles both legacy format (token only) and new format (token:videoId).
 */
export async function releaseGpuLock(userId: string, token: string): Promise<boolean> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;

  // Atomic: check if the stored value starts with our token, then delete
  // Supports both "token" (legacy) and "token:videoId" (new) formats
  const luaScript = `
    local val = redis.call("get", KEYS[1])
    if val == false then return 0 end
    local storedToken = val:match("^([^:]+)")
    if storedToken == ARGV[1] then
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
 * @param userId  - User whose GPU VM to lock
 * @param fn      - Async function to run while holding the lock
 * @param ttlMs   - Lock auto-expiry TTL (should exceed expected fn duration)
 * @param videoId - Optional videoId to associate with the lock
 * @returns Result of fn
 */
export async function withGpuLock<T>(
  userId: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_MAX_LOCK_TTL_MS,
  videoId?: string,
): Promise<T> {
  const token = await acquireGpuLock(userId, ttlMs, undefined, videoId);

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
 * Returns lock status, TTL, and the videoId holding the lock (if available).
 */
export async function isGpuLockHeld(userId: string): Promise<{ held: boolean; ttl: number; videoId?: string }> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;
  const [val, ttl] = await Promise.all([
    redis.get(lockKey),
    redis.ttl(lockKey),
  ]);

  // Parse videoId from lock value (format: "token:videoId" or just "token")
  let videoId: string | undefined;
  if (val && val.includes(':')) {
    // Format: token:videoId — the videoId is everything after the first 36 chars + colon
    // UUID is 36 chars, so token:videoId starts at [37]
    const parts = val.split(':');
    // UUID has 4 hyphens so 5 parts when split by ':', reconstruct
    // Actually UUIDs are formatted as xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx 
    // So splitting by ':' won't break the UUID. videoId is the last segment.
    if (parts.length > 1) {
      // The token is a UUID (no colons), videoId is appended after the first colon
      videoId = val.substring(val.indexOf(':') + 1);
    }
  }

  return {
    held: ttl > 0,
    ttl: Math.max(0, ttl),
    videoId,
  };
}

/**
 * Release a user's GPU lock ONLY if it's held by a specific video.
 * This is the concurrency-safe way to release locks on video cancellation.
 * If the lock is held by a different video, it's left untouched.
 *
 * @returns true if the lock was released, false if it wasn't held by this video
 */
export async function releaseGpuLockForVideo(userId: string, videoId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;

  // Atomic Lua: check if the lock value ends with ':videoId', then delete
  const luaScript = `
    local val = redis.call("get", KEYS[1])
    if val == false then return 0 end
    local colonPos = val:find(":")
    if colonPos then
      local storedVideoId = val:sub(colonPos + 1)
      if storedVideoId == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
    end
    return 0
  `;

  const result = await redis.eval(luaScript, 1, lockKey, videoId);

  if (result === 1) {
    console.log(`${LOG_PREFIX} Released lock for user ${userId} (video: ${videoId.slice(0, 8)}...)`);
    return true;
  }

  const lockInfo = await isGpuLockHeld(userId);
  if (lockInfo.held) {
    console.log(`${LOG_PREFIX} Lock NOT released — held by different video (${lockInfo.videoId?.slice(0, 8) || 'unknown'}..., not ${videoId.slice(0, 8)}...)`);
  } else {
    console.log(`${LOG_PREFIX} No lock found for user ${userId}`);
  }
  return false;
}

/**
 * Force-release a user's GPU lock regardless of token or videoId.
 * Use ONLY for manual admin intervention when a lock is truly stuck.
 * ⚠️ DANGER: This will kill the lock even if another video holds it.
 */
export async function forceReleaseGpuLock(userId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const lockKey = `gpu-lock:${userId}`;
  const result = await redis.del(lockKey);
  
  if (result === 1) {
    console.log(`${LOG_PREFIX} Force-released lock for user ${userId}`);
    return true;
  }
  
  console.log(`${LOG_PREFIX} No lock found to force-release for user ${userId}`);
  return false;
}
