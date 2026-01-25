/**
 * Video Segmentation API
 * ==========================================================================
 * POST /api/segment
 * Queues a video for segmentation into classified clips.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { videoSegmentationQueue } from '@/lib/queues/queues';
import type { SegmentVideoJobData } from '@/lib/segmentation/types';

export async function POST(req: Request) {
  try {
    console.log('[Segment API] Starting segmentation request...');
    
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Segment API] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Segment API] User authenticated:', user.id.substring(0, 8) + '...');

    // 2. Parse request body
    const body = await req.json();
    const { 
      videoId, 
      videoR2Key, 
      sourceUrl,
      filterPrompt,
      minClipDuration = 5,
      maxClipDuration = 10,
    } = body;

    if (!videoId || !sourceUrl) {
      return NextResponse.json(
        { error: 'videoId and sourceUrl are required' },
        { status: 400 }
      );
    }

    // 3. Create job data
    const jobData: SegmentVideoJobData = {
      userId: user.id,
      videoId,
      videoR2Key: videoR2Key || `stock-media/videos/${videoId}`,
      sourceUrl,
      targetClipDuration: {
        min: minClipDuration,
        max: maxClipDuration,
      },
      filterPrompt: filterPrompt || undefined,
    };

    // 4. Add to queue
    console.log(`[Segment API] Queueing segmentation job for video ${videoId}`);
    const job = await videoSegmentationQueue.add(
      `segment-${videoId}`,
      jobData,
      {
        jobId: `segment-${videoId}-${Date.now()}`,
      }
    );

    console.log(`[Segment API] ✓ Job ${job.id} queued`);

    // 5. Return job info
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Segmentation job queued',
      videoId,
    });

  } catch (error) {
    console.error('[Segment API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/segment?jobId=xxx
 * Check the status of a segmentation job.
 */
export async function GET(req: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get job ID from query
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId query parameter is required' },
        { status: 400 }
      );
    }

    // 3. Get job status
    const job = await videoSegmentationQueue.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const state = await job.getState();
    const progress = job.progress;

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
      data: state === 'completed' ? job.returnvalue : null,
      failedReason: state === 'failed' ? job.failedReason : null,
    });

  } catch (error) {
    console.error('[Segment API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
