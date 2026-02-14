/**
 * Video Render Worker
 * ============================================================================
 * BullMQ worker for Remotion Lambda video renders.
 *
 * Job flow:
 * 1. Validate render props
 * 2. Start Lambda render (200 parallel chunks → R2)
 * 3. Poll progress until done/error
 * 4. Update job result with output URL
 */

import { Job, Processor } from 'bullmq';
import {
  startLambdaRender,
  getLambdaRenderProgress,
  type StartRenderResult,
} from '@/lib/services/render/lambda-renderer';
import { validateRenderProps, type SerializedRenderProps } from '@/lib/services/render/render-serializer';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface VideoRenderJobData {
  /** Unique job identifier (UUID) */
  jobId: string;
  /** User who initiated the render */
  userId: string;
  /** Associated video project ID */
  videoId: string;
  /** Serialized composition props for Remotion */
  inputProps: SerializedRenderProps;
  /** Output key in R2 (e.g., `renders/{userId}/{videoId}.mp4`) */
  outputKey: string;
  /** Optional composition ID override */
  compositionId?: string;
}

export interface VideoRenderJobResult {
  success: boolean;
  renderId: string;
  outputUrl?: string;
  outputSizeBytes?: number;
  durationMs: number;
  costs?: {
    accruedSoFar: number;
    displayCost: string;
    currency: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Waits for the specified number of milliseconds.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Progress poll interval in ms */
const POLL_INTERVAL_MS = 2000;

/** Max time to wait for a render before considering it timed out (15 minutes) */
const MAX_RENDER_WAIT_MS = 15 * 60 * 1000;

// ============================================================================
// PROCESSOR
// ============================================================================

export const videoRenderProcessor: Processor<VideoRenderJobData, VideoRenderJobResult> = async (
  job: Job<VideoRenderJobData, VideoRenderJobResult>
) => {
  const { jobId, userId, videoId: _videoId, inputProps, outputKey, compositionId } = job.data;
  const startTime = Date.now();

  console.log(`[VideoRender] Starting job ${job.id} (jobId: ${jobId}) for user ${userId}`);

  // Step 1: Validate render props
  const issues = validateRenderProps(inputProps);
  if (issues.length > 0) {
    throw new Error(
      `[VideoRender] Invalid render props: ${issues.join('; ')}`
    );
  }

  // Step 2: Start the Lambda render
  await job.updateProgress({ phase: 'starting', progress: 0 });
  console.log(`[VideoRender] Starting Lambda render for ${outputKey}`);

  let renderResult: StartRenderResult;
  try {
    renderResult = await startLambdaRender({
      inputProps: inputProps as unknown as Record<string, unknown>,
      outputKey,
      compositionId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[VideoRender] Failed to start Lambda render:`, msg);
    throw new Error(`Lambda render failed to start: ${msg}`);
  }

  console.log(`[VideoRender] Lambda render started: ${renderResult.renderId}`);
  await job.updateProgress({
    phase: 'rendering',
    progress: 0.05,
    renderId: renderResult.renderId,
  });

  // Step 3: Poll for progress
  const deadline = Date.now() + MAX_RENDER_WAIT_MS;

  while (Date.now() < deadline) {
    await wait(POLL_INTERVAL_MS);

    try {
      const progress = await getLambdaRenderProgress(
        renderResult.renderId,
        renderResult.bucketName
      );

      // Update BullMQ job progress
      await job.updateProgress({
        phase: progress.phase,
        progress: progress.overallProgress,
        renderId: renderResult.renderId,
      });

      console.log(
        `[VideoRender] ${renderResult.renderId} — ` +
          `${(progress.overallProgress * 100).toFixed(1)}% (${progress.phase})`
      );

      // Check for errors
      if (progress.fatalErrorEncountered) {
        throw new Error(
          `Lambda render failed: ${progress.errorMessage ?? 'Unknown error'}`
        );
      }

      // Check for completion
      if (progress.done) {
        const durationMs = Date.now() - startTime;
        console.log(
          `[VideoRender] Completed in ${(durationMs / 1000).toFixed(1)}s — ` +
            `${progress.outputUrl}`
        );

        return {
          success: true,
          renderId: renderResult.renderId,
          outputUrl: progress.outputUrl,
          outputSizeBytes: progress.outputSizeInBytes,
          durationMs,
          costs: progress.costs,
        };
      }
    } catch (error) {
      // Differentiate polling errors from actual render errors
      if (error instanceof Error && error.message.startsWith('Lambda render failed:')) {
        throw error;
      }
      // Network/transient error during polling — log and retry
      console.warn(
        `[VideoRender] Polling error (will retry): ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // Timed out
  throw new Error(
    `Lambda render timed out after ${MAX_RENDER_WAIT_MS / 1000}s ` +
      `(renderId: ${renderResult.renderId})`
  );
};
