/**
 * Lambda Renderer Service
 *
 * Server-side service for triggering and monitoring Remotion Lambda renders.
 * Uses @remotion/lambda/client to avoid Chromium bundling issues in serverless.
 */

import {
  renderMediaOnLambda,
  getRenderProgress,
  speculateFunctionName,
} from "@remotion/lambda/client";
import { lambdaConfig } from "./lambda-config";

// ============================================================
// TYPES
// ============================================================

export interface StartRenderParams {
  /** Serialized composition input props (overlays, dimensions, fps, etc.) */
  inputProps: Record<string, unknown>;
  /** Unique output key for R2 (e.g., `renders/{userId}/{projectId}.mp4`) */
  outputKey: string;
  /** Optional composition ID override */
  compositionId?: string;
}

export interface StartRenderResult {
  renderId: string;
  bucketName: string;
  cloudWatchLogs: string | null;
  folderInS3Console: string | null;
}

export interface RenderProgressResult {
  /** Overall progress 0–1 */
  overallProgress: number;
  /** Current phase description */
  phase: string;
  /** True when the render is fully done */
  done: boolean;
  /** Final output URL (only when done) */
  outputUrl?: string;
  /** Output file size in bytes (only when done) */
  outputSizeInBytes?: number;
  /** Error message if render failed */
  fatalErrorEncountered?: boolean;
  errorMessage?: string;
  /** Cost estimation in USD */
  costs?: {
    accruedSoFar: number;
    displayCost: string;
    currency: string;
  };
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

/**
 * Kicks off a Remotion Lambda render job.
 *
 * The render distributes work across up to 200 Lambda functions,
 * each processing a chunk of frames. The final stitched video
 * is uploaded directly to Cloudflare R2 via s3OutputProvider.
 */
export async function startLambdaRender(
  params: StartRenderParams
): Promise<StartRenderResult> {
  const { inputProps, outputKey, compositionId } = params;

  const result = await renderMediaOnLambda({
    region: lambdaConfig.region,
    functionName: lambdaConfig.functionName,
    serveUrl: lambdaConfig.serveUrl,
    composition: compositionId ?? lambdaConfig.compositionId,
    inputProps,
    codec: "h264",
    audioCodec: "mp3", // Faster combining phase vs AAC
    concurrency: lambdaConfig.lambdasPerRender,
    privacy: "no-acl", // Required for R2 (no ACL support)
    deleteAfter: "1-day", // Auto-clean S3 temp artifacts
    timeoutInMilliseconds: 30000,
    outName: {
      bucketName: lambdaConfig.r2BucketName,
      key: outputKey,
      s3OutputProvider: {
        endpoint: lambdaConfig.r2Endpoint,
        accessKeyId: lambdaConfig.r2AccessKeyId,
        secretAccessKey: lambdaConfig.r2SecretAccessKey,
      },
    },
    // Webhook for completion callback (optional optimization)
    ...(lambdaConfig.webhookBaseUrl
      ? {
          webhook: {
            url: `${lambdaConfig.webhookBaseUrl}/api/render/webhook`,
            secret: null,
          },
        }
      : {}),
  });

  return {
    renderId: result.renderId,
    bucketName: result.bucketName,
    cloudWatchLogs: "cloudWatchLogs" in result ? (result as any).cloudWatchLogs : null,
    folderInS3Console: "folderInS3Console" in result ? (result as any).folderInS3Console : null,
  };
}

/**
 * Polls the progress of a Remotion Lambda render.
 *
 * Call this every 1–2 seconds from the render worker.
 * The progress includes chunk completion, stitching phase, and encoding.
 */
export async function getLambdaRenderProgress(
  renderId: string,
  bucketName: string
): Promise<RenderProgressResult> {
  const progress = await getRenderProgress({
    renderId,
    bucketName,
    region: lambdaConfig.region,
    functionName: lambdaConfig.functionName,
  });

  // Determine the current phase
  let phase = "initializing";
  if (progress.fatalErrorEncountered) {
    phase = "error";
  } else if (progress.done) {
    phase = "done";
  } else if (progress.overallProgress > 0) {
    // Estimate phase from progress stages
    if (progress.overallProgress < 0.8) {
      phase = "rendering-chunks";
    } else if (progress.overallProgress < 0.95) {
      phase = "stitching";
    } else {
      phase = "encoding";
    }
  }

  return {
    overallProgress: progress.overallProgress,
    phase,
    done: progress.done,
    outputUrl: progress.outputFile ?? undefined,
    outputSizeInBytes: progress.outputSizeInBytes ?? undefined,
    fatalErrorEncountered: progress.fatalErrorEncountered,
    errorMessage: progress.errors?.[0]?.message,
    costs: progress.costs
      ? {
          accruedSoFar: progress.costs.accruedSoFar,
          displayCost: progress.costs.displayCost,
          currency: progress.costs.currency,
        }
      : undefined,
  };
}

/**
 * Generates the function name for the Lambda function
 * using Remotion's speculate helper.
 * 
 * Useful for deploy scripts and validation.
 */
export function getSpeculatedFunctionName(): string {
  return speculateFunctionName({
    diskSizeInMb: lambdaConfig.lambdaDiskMb,
    memorySizeInMb: lambdaConfig.lambdaMemoryMb,
    timeoutInSeconds: lambdaConfig.lambdaTimeoutSec,
  });
}
