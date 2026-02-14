/**
 * POST /api/render
 *
 * Initiates a video render by enqueuing a job to the BullMQ `video-render` queue.
 * The worker will call Remotion Lambda to render and output to R2.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { videoRenderQueue } from '@/lib/queues/queues';
import { serializeRenderProps, validateRenderProps } from '@/lib/services/render/render-serializer';
import { lambdaConfig } from '@/lib/services/render/lambda-config';
import { v4 as uuid } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const {
      videoId,
      overlays,
      durationInFrames,
      width,
      height,
      fps,
      compositionId,
      src,
    } = body;

    if (!videoId || !overlays || !durationInFrames || !width || !height || !fps) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, overlays, durationInFrames, width, height, fps' },
        { status: 400 }
      );
    }

    // 3. Rate limit: check active renders for this user
    const activeJobs = await videoRenderQueue.getActive();
    const waitingJobs = await videoRenderQueue.getWaiting();
    const userActiveCount = [...activeJobs, ...waitingJobs].filter(
      (j) => j.data?.userId === user.id
    ).length;

    if (userActiveCount >= lambdaConfig.maxRendersPerUser) {
      return NextResponse.json(
        {
          error: `Too many active renders. Maximum ${lambdaConfig.maxRendersPerUser} concurrent renders per user.`,
          activeCount: userActiveCount,
        },
        { status: 429 }
      );
    }

    // 4. Serialize and validate
    const { inputProps, payloadSizeBytes, warnings } = serializeRenderProps(
      { overlays, durationInFrames, width, height, fps },
      { src: src ?? '' }
    );

    const issues = validateRenderProps(inputProps);
    if (issues.length > 0) {
      return NextResponse.json(
        { error: 'Invalid render props', issues },
        { status: 400 }
      );
    }

    // 5. Generate output key
    const jobId = uuid();
    const timestamp = Date.now();
    const outputKey = `renders/${user.id}/${videoId}/${timestamp}.mp4`;

    // 6. Enqueue render job
    const job = await videoRenderQueue.add(
      'render',
      {
        jobId,
        userId: user.id,
        videoId,
        inputProps,
        outputKey,
        compositionId,
      },
      {
        jobId, // Use our UUID as the BullMQ job ID for deduplication
      }
    );

    console.log(
      `[API/render] Enqueued render job ${job.id} for user ${user.id} ` +
        `(${(payloadSizeBytes / 1024).toFixed(1)}KB payload)`
    );

    // 7. Return job info
    return NextResponse.json({
      jobId,
      bullmqJobId: job.id,
      outputKey,
      payloadSizeKB: Math.round(payloadSizeBytes / 1024),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('[API/render] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
