/**
 * Per-User Rate Limiter
 * ============================================================================
 * In-memory sliding-window rate limiter keyed by user ID.
 * Each limiter instance tracks a specific route/category.
 *
 * Usage:
 *   const limiter = createRateLimiter("process-routes", 60_000, 30);
 *   const blocked = limiter.check(userId);
 *   if (blocked) return blocked; // Returns a 429 NextResponse
 */

import { NextResponse } from "next/server";

interface RateLimiterEntry {
  timestamps: number[];
}

/**
 * Creates a per-user rate limiter for a specific route category.
 *
 * @param name - Identifier for this limiter (for logging)
 * @param windowMs - Sliding window duration in milliseconds
 * @param maxRequests - Maximum requests allowed within the window
 */
export function createRateLimiter(
  name: string,
  windowMs: number,
  maxRequests: number
) {
  const store = new Map<string, RateLimiterEntry>();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Remove entries where all timestamps are expired
      const validTimestamps = entry.timestamps.filter(
        (t) => now - t < windowMs
      );
      if (validTimestamps.length === 0) {
        store.delete(key);
      } else {
        entry.timestamps = validTimestamps;
      }
    }
  }, 5 * 60 * 1000);

  // Allow garbage collection of the interval when the process exits
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    /**
     * Check if a user has exceeded their rate limit.
     * Returns null if allowed, or a 429 NextResponse if blocked.
     */
    check(userId: string): NextResponse | null {
      const now = Date.now();
      let entry = store.get(userId);

      if (!entry) {
        entry = { timestamps: [] };
        store.set(userId, entry);
      }

      // Remove timestamps outside the current window
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      if (entry.timestamps.length >= maxRequests) {
        const oldestValid = entry.timestamps[0];
        const retryAfterMs = windowMs - (now - oldestValid);
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        console.warn(
          `[RateLimit:${name}] User ${userId} exceeded ${maxRequests} req/${windowMs / 1000}s`
        );

        return NextResponse.json(
          {
            error: "Too many requests",
            retryAfter: retryAfterSec,
            message: `Rate limit exceeded. Please try again in ${retryAfterSec} seconds.`,
          },
          {
            status: 429,
            headers: {
              "Retry-After": retryAfterSec.toString(),
            },
          }
        );
      }

      // Record this request
      entry.timestamps.push(now);
      return null; // Allowed
    },

    /** Get current request count for a user (for debugging) */
    getCount(userId: string): number {
      const now = Date.now();
      const entry = store.get(userId);
      if (!entry) return 0;
      return entry.timestamps.filter((t) => now - t < windowMs).length;
    },
  };
}
