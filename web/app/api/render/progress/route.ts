/**
 * GET /api/render/progress?jobId=xxx
 *
 * Polls the progress of a render job from BullMQ.
 * Returns a ProgressResponse compatible with the VideoRenderer interface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { videoRenderQueue } from '@/lib/queues/queues';
import type { ProgressResponse } from '@/features/video-editor-v2/types';

export async function GET(request: NextRequest) {
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

    // 2. Get jobId from query params
    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing required query param: jobId' },
        { status: 400 }
      );
    }

    // 3. Look up the job
    const job = await videoRenderQueue.getJob(jobId);
    if (!job) {
      const response: ProgressResponse = {
        type: 'error',
        message: `Render job not found: ${jobId}`,
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 4. Verify ownership
    if (job.data?.userId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 5. Determine state
    const state = await job.getState();
    const progress = job.progress as Record<string, unknown> | undefined;

    let response: ProgressResponse;

    switch (state) {
      case 'completed': {
        const result = job.returnvalue;
        response = {
          type: 'done',
          url: result?.outputUrl ?? '',
          size: result?.outputSizeBytes ?? 0,
        };
        break;
      }

      case 'failed': {
        response = {
          type: 'error',
          message: job.failedReason ?? 'Render failed (unknown reason)',
        };
        break;
      }

      case 'active':
      case 'waiting':
      case 'delayed':
      default: {
        const progressValue =
          typeof progress?.progress === 'number' ? progress.progress : 0;
        response = {
          type: 'progress',
          progress: progressValue,
        };
        break;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API/render/progress] Error:', error);
    const response: ProgressResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Internal server error',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
