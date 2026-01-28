/**
 * Research Comparison API Route
 * ============================================================================
 * Enqueues research jobs to BullMQ worker and provides status polling.
 * Used by the Universal Script Tester dev tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { researchCompareQueue } from '@/lib/queues/queues';
import type { ResearchCompareInput, ResearchCompareOutput } from '@/lib/queues/workers/research-compare';

// ============================================================================
// POST: Enqueue research job
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      topic,
      genre = 'documentary',
      researchToggle = 'full',
      angle,
      sourcePreferences,
      researchProvider = 'valyu',
      durationRange,
    } = body;

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic is required' },
        { status: 400 }
      );
    }

    console.log('[ResearchCompare] Enqueuing research job');
    console.log(`[ResearchCompare] Topic: "${topic.substring(0, 50)}..."`);
    console.log(`[ResearchCompare] Provider: ${researchProvider}, Toggle: ${researchToggle}`);

    // Enqueue job to BullMQ worker
    const jobData: ResearchCompareInput = {
      userId: user.id,
      topic,
      genre,
      researchToggle,
      angle,
      sourcePreferences,
      researchProvider,
      durationRange,
    };

    const job = await researchCompareQueue.add('research', jobData, {
      removeOnComplete: { age: 3600, count: 50 }, // Keep for 1 hour
      removeOnFail: { age: 86400, count: 100 }, // Keep failures for 24 hours
    });

    console.log(`[ResearchCompare] Job enqueued: ${job.id}`);

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
    });

  } catch (error) {
    console.error('[ResearchCompare] Error enqueuing job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enqueue research job' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Poll job status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    const job = await researchCompareQueue.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get job state
    const state = await job.getState();
    const progress = job.progress;

    // If completed, return the result
    if (state === 'completed') {
      const result = job.returnvalue as ResearchCompareOutput | null;
      
      // Handle case where returnvalue might be null
      if (!result) {
        console.warn('[ResearchCompare] Job completed but returnvalue is null');
        return NextResponse.json({
          status: 'completed',
          result: {
            success: false,
            dossier: null,
            durationMs: 0,
            metrics: null,
            error: 'Job completed but no result returned',
          },
        });
      }
      
      return NextResponse.json({
        status: 'completed',
        result: {
          success: result.success ?? false,
          dossier: result.dossier ?? null,
          durationMs: result.durationMs ?? 0,
          metrics: result.metrics ?? null,
          error: result.error,
          outline: result.outline ?? null,
        },
      });
    }

    // If failed, return the error
    if (state === 'failed') {
      const failedReason = job.failedReason;
      return NextResponse.json({
        status: 'failed',
        error: failedReason || 'Research job failed',
      });
    }

    // Still processing
    return NextResponse.json({
      status: state, // 'waiting', 'active', 'delayed', etc.
      progress,
    });

  } catch (error) {
    console.error('[ResearchCompare] Error getting job status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get job status' },
      { status: 500 }
    );
  }
}
