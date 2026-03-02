/**
 * Remotion Lambda Configuration
 *
 * Centralized configuration for all Remotion Lambda render settings.
 * All values are sourced from environment variables with sensible defaults.
 */

import type { AwsRegion } from "@remotion/lambda";

// ============================================================
// ENV VAR HELPERS
// ============================================================

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[Lambda Config] Missing required environment variable: ${key}`
    );
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    console.warn(
      `[Lambda Config] Invalid integer for ${key}: "${raw}", using default ${defaultValue}`
    );
    return defaultValue;
  }
  return parsed;
}

// ============================================================
// CONFIGURATION
// ============================================================

export const lambdaConfig = {
  // --- AWS Lambda ---
  get region(): AwsRegion {
    return requireEnv("REMOTION_AWS_REGION") as AwsRegion;
  },
  get functionName(): string {
    return requireEnv("REMOTION_FUNCTION_NAME");
  },
  get serveUrl(): string {
    return requireEnv("REMOTION_SERVE_URL");
  },
  get s3Bucket(): string {
    return requireEnv("REMOTION_S3_BUCKET");
  },

  // --- Cloudflare R2 Output (reuses existing R2 config) ---
  get r2BucketName(): string {
    return requireEnv("R2_BUCKET_NAME");
  },
  get r2Endpoint(): string {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    return `https://${accountId}.r2.cloudflarestorage.com`;
  },
  get r2AccessKeyId(): string {
    return requireEnv("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey(): string {
    return requireEnv("R2_SECRET_ACCESS_KEY");
  },

  // --- Render Tuning ---

  /** Max simultaneous render jobs (BullMQ worker concurrency). Default: 4 */
  get renderConcurrencyLimit(): number {
    return optionalEnvInt("RENDER_CONCURRENCY_LIMIT", 4);
  },

  /** Lambda chunks per render (max parallelism). Default: 200 (max allowed) */
  get lambdasPerRender(): number {
    const val = optionalEnvInt("LAMBDAS_PER_RENDER", 200);
    return Math.min(val, 200); // Hard cap at 200
  },

  /** Lambda memory in MB. Default: 2048 */
  get lambdaMemoryMb(): number {
    return optionalEnvInt("RENDER_LAMBDA_MEMORY_MB", 2048);
  },

  /** Lambda disk size in MB. Default: 10240 (max, <1% cost impact) */
  get lambdaDiskMb(): number {
    return optionalEnvInt("RENDER_LAMBDA_DISK_MB", 10240);
  },

  /** Lambda timeout in seconds. Default: 120 */
  get lambdaTimeoutSec(): number {
    return optionalEnvInt("RENDER_LAMBDA_TIMEOUT_SEC", 120);
  },

  /** Per-user max concurrent renders (rate limit). Default: 3 */
  get maxRendersPerUser(): number {
    return optionalEnvInt("MAX_RENDERS_PER_USER", 3);
  },

  /** Composition name in the Remotion bundle. Default: 'MainComposition' */
  get compositionId(): string {
    return optionalEnv("REMOTION_COMPOSITION_ID", "VideoComposition");
  },

  /** Webhook base URL for Lambda callbacks */
  get webhookBaseUrl(): string | undefined {
    return process.env.REMOTION_WEBHOOK_BASE_URL;
  },

  /** Total AWS Lambda concurrent execution limit for the account. Default: 1000 */
  get lambdaAccountConcurrency(): number {
    return optionalEnvInt("LAMBDA_ACCOUNT_CONCURRENCY", 1000);
  },

  /**
   * Maximum safe concurrent renders based on account Lambda concurrency limit.
   * Formula: floor(accountLimit / lambdasPerRender)
   * Ensures we never exceed AWS Lambda throttling thresholds.
   */
  get maxSafeConcurrentRenders(): number {
    return Math.max(1, Math.floor(this.lambdaAccountConcurrency / this.lambdasPerRender));
  },
} as const;

// ============================================================
// VALIDATION
// ============================================================

const REQUIRED_ENV_VARS = [
  "REMOTION_AWS_REGION",
  "REMOTION_FUNCTION_NAME",
  "REMOTION_SERVE_URL",
  "REMOTION_S3_BUCKET",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/**
 * Validates that all required environment variables are set.
 * Call this at application startup to fail fast.
 *
 * @returns List of missing env var names (empty = all good)
 */
export function validateLambdaConfig(): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Logs the current Lambda config (redacting secrets).
 * Useful for debugging deployments.
 */
export function logLambdaConfig(): void {
  console.log("[Lambda Config]", {
    region: process.env.REMOTION_AWS_REGION ?? "(not set)",
    functionName: process.env.REMOTION_FUNCTION_NAME ?? "(not set)",
    serveUrl: process.env.REMOTION_SERVE_URL ?? "(not set)",
    s3Bucket: process.env.REMOTION_S3_BUCKET ?? "(not set)",
    r2BucketName: process.env.R2_BUCKET_NAME ?? "(not set)",
    r2Endpoint: process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : "(not set)",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ? "***" : "(not set)",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      ? "***"
      : "(not set)",
    renderConcurrencyLimit: lambdaConfig.renderConcurrencyLimit,
    lambdasPerRender: lambdaConfig.lambdasPerRender,
    lambdaMemoryMb: lambdaConfig.lambdaMemoryMb,
    lambdaDiskMb: lambdaConfig.lambdaDiskMb,
    lambdaTimeoutSec: lambdaConfig.lambdaTimeoutSec,
    maxRendersPerUser: lambdaConfig.maxRendersPerUser,
    compositionId: lambdaConfig.compositionId,
  });
}
