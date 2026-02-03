/**
 * GPU Health Guard
 * ============================================================================
 * Shared utility for GPU workers to wait for VM readiness with retry logic.
 * Used at the start of GPU workers to handle race conditions when jobs are
 * dispatched before VM is fully ready.
 */

import {
  checkGpuVmReady,
  VmReadinessResult,
} from '@/lib/services/gpu-api-service';

const MAX_HEALTH_RETRIES = 12;       // 12 attempts
const HEALTH_RETRY_DELAY_MS = 5000;  // 5 seconds between retries
const TOTAL_TIMEOUT_MS = 60000;      // 1 minute max total wait time

/**
 * Wait for GPU VM to be ready with retry logic.
 * Used at the start of GPU workers to handle race conditions.
 * 
 * @param userId - User ID to check VM readiness for
 * @param logPrefix - Prefix for log messages (e.g., '[Assets/ReferenceImages]')
 * @returns VmReadinessResult when VM is ready
 * @throws Error if VM is not ready after all retries
 */
export async function waitForGpuReady(
  userId: string,
  logPrefix: string,
): Promise<VmReadinessResult> {
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_HEALTH_RETRIES; attempt++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TOTAL_TIMEOUT_MS) {
      throw new Error(`GPU VM not ready after ${elapsed}ms (timeout exceeded)`);
    }

    const vmStatus = await checkGpuVmReady(userId);

    if (vmStatus.ready) {
      console.log(
        `${logPrefix} GPU VM ready at ${vmStatus.ip} (mode: ${vmStatus.currentMode || 'unknown'})`,
      );
      return vmStatus;
    }

    console.log(
      `${logPrefix} VM not ready (attempt ${attempt}/${MAX_HEALTH_RETRIES}): ${vmStatus.reason}`,
    );

    if (attempt < MAX_HEALTH_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_DELAY_MS));
    }
  }

  throw new Error(
    `GPU VM not ready after ${MAX_HEALTH_RETRIES} health check attempts`,
  );
}

/**
 * Configuration for health guard behavior
 */
export const GPU_HEALTH_GUARD_CONFIG = {
  maxRetries: MAX_HEALTH_RETRIES,
  retryDelayMs: HEALTH_RETRY_DELAY_MS,
  totalTimeoutMs: TOTAL_TIMEOUT_MS,
};
