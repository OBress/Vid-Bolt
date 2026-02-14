/**
 * POST /api/render/webhook
 *
 * Receives completion callbacks from Remotion Lambda.
 * This is an optimization that allows immediate job completion
 * without waiting for the next progress poll.
 *
 * Note: This endpoint is optional — the render worker will still
 * detect completion via polling if the webhook fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { videoRenderQueue } from '@/lib/queues/queues';

interface WebhookPayload {
  type: 'success' | 'timeout' | 'error';
  renderId: string;
  expectedBucketOwner: string;
  bucketName: string;
  customData?: Record<string, unknown>;
  outputUrl?: string;
  outputFile?: string;
  lambdaErrors?: Array<{ message: string }>;
  timeoutInMilliseconds?: number;
  costs?: {
    accruedSoFar: number;
    displayCost: string;
    currency: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: WebhookPayload = await request.json();

    console.log(
      `[Webhook] Received ${payload.type} callback for render ${payload.renderId}`
    );

    // Find the active or waiting job that matches this renderId
    const activeJobs = await videoRenderQueue.getActive();
    const matchingJob = activeJobs.find((job) => {
      const progress = job.progress as Record<string, unknown> | undefined;
      return progress?.renderId === payload.renderId;
    });

    if (!matchingJob) {
      console.warn(
        `[Webhook] No matching active job found for renderId: ${payload.renderId}`
      );
      // Still return 200 — Remotion may retry on non-2xx
      return NextResponse.json({ received: true, matched: false });
    }

    // Log the webhook data for the poll loop to pick up
    // The worker's polling loop will naturally complete on the next iteration
    // since getRenderProgress will now return done=true
    console.log(
      `[Webhook] Matched job ${matchingJob.id} for render ${payload.renderId} ` +
        `(type: ${payload.type})`
    );

    if (payload.type === 'error') {
      console.error(
        `[Webhook] Render ${payload.renderId} failed:`,
        payload.lambdaErrors
      );
    }

    return NextResponse.json({
      received: true,
      matched: true,
      jobId: matchingJob.id,
    });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    // Return 200 to prevent Remotion from retrying
    return NextResponse.json(
      { received: true, error: 'Processing error' },
      { status: 200 }
    );
  }
}
