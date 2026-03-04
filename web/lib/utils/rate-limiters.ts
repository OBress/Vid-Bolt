/**
 * Rate Limiter Instances
 * ============================================================================
 * Centralized rate limiter instances for different route categories.
 * Each limiter enforces per-user request limits within a sliding window.
 *
 * Import the specific limiter you need in your route handler:
 *   import { processLimiter } from "@/lib/utils/rate-limiters";
 *   const blocked = processLimiter.check(userId);
 *   if (blocked) return blocked;
 */

import { createRateLimiter } from "./rate-limiter";

const ONE_MINUTE = 60_000;

/** AI script generation routes (/api/process/*) — 30 req/min */
export const processLimiter = createRateLimiter("process", ONE_MINUTE, 30);

/** Stripe checkout creation — 10 req/min */
export const stripeLimiter = createRateLimiter("stripe", ONE_MINUTE, 10);

/** GCP VM operations — 20 req/min (status polling every ~10s during transitions) */
export const gcpLimiter = createRateLimiter("gcp", ONE_MINUTE, 20);

/** Stock media batch scraping — 10 req/min */
export const stockScrapeLimiter = createRateLimiter("stock-scrape", ONE_MINUTE, 10);

/** LoRA file uploads — 10 req/min */
export const loraUploadLimiter = createRateLimiter("lora-upload", ONE_MINUTE, 10);

/** Keyframe regeneration — 20 req/min */
export const keyframeLimiter = createRateLimiter("keyframe", ONE_MINUTE, 20);

/** Video/image/MG generation — 15 req/min */
export const generationLimiter = createRateLimiter("generation", ONE_MINUTE, 15);

/** Admin audio cleaning — 5 req/min */
export const audioCleanLimiter = createRateLimiter("audio-clean", ONE_MINUTE, 5);

/** Video render — 10 req/min */
export const renderLimiter = createRateLimiter("render", ONE_MINUTE, 10);
