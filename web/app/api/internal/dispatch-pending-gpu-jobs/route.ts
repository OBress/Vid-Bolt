/**
 * Internal API: Dispatch Pending GPU Jobs
 * ============================================================================
 * Called by the GCP startup webhook when VM becomes ready.
 * Dispatches all pending GPU jobs for the specified user.
 * 
 * This endpoint is secured with an internal API secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkGpuVmReady } from '@/lib/services/gpu-api-service';
import { dispatchPendingJobs } from '@/lib/services/gpu-job-orchestrator';

export async function POST(req: NextRequest) {
  const logPrefix = '[DispatchPendingJobs]';

  // Verify internal call
  const secret = req.headers.get('X-Internal-Secret');
  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (!expectedSecret) {
    console.error(`${logPrefix} INTERNAL_API_SECRET not configured`);
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  if (secret !== expectedSecret) {
    console.warn(`${logPrefix} Unauthorized request - invalid secret`);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id in request body' },
        { status: 400 }
      );
    }

    console.log(`${logPrefix} Received dispatch request for user ${user_id}`);

    // Verify VM is actually ready before dispatching
    const vmStatus = await checkGpuVmReady(user_id);
    if (!vmStatus.ready) {
      console.log(`${logPrefix} VM not ready: ${vmStatus.reason}`);
      return NextResponse.json(
        {
          error: 'VM not ready',
          reason: vmStatus.reason,
        },
        { status: 503 }
      );
    }

    console.log(`${logPrefix} VM confirmed ready at ${vmStatus.ip}, dispatching jobs`);

    // Dispatch all pending jobs
    const result = await dispatchPendingJobs(user_id);

    console.log(
      `${logPrefix} Dispatch complete: ${result.dispatched} dispatched, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      dispatched: result.dispatched,
      failed: result.failed,
      results: result.results,
    });
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
