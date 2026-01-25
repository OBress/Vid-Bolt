/**
 * Segmentation Job Status API
 * ==========================================================================
 * Query the status of a video segmentation job by its ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { getRedisConnection } from '@/lib/queues/redis';

const QUEUE_NAME = 'video-segmentation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'Missing jobId parameter' },
      { status: 400 }
    );
  }

  try {
    const connection = getRedisConnection();
    const queue = new Queue(QUEUE_NAME, { connection });
    
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const state = await job.getState();
    const progress = job.progress;
    
    const response: Record<string, unknown> = {
      jobId: job.id,
      state,
      progress,
      data: job.data,
    };

    if (state === 'completed') {
      response.result = job.returnvalue;
    } else if (state === 'failed') {
      response.failedReason = job.failedReason;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[SegmentStatus] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get job status' },
      { status: 500 }
    );
  }
}
