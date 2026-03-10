/**
 * Force Analytics Sync API (Admin Only)
 * POST — Enqueues all analytics workers for an immediate sync.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/utils/admin-auth';

export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  // auth is AdminAuthResult here

  try {
    // Dynamically import queues to avoid bundling BullMQ in client
    const {
      analyticsChannelStatsQueue,
      analyticsDailySnapshotQueue,
      analyticsVideoQueue,
      analyticsDemographicsQueue,
      analyticsCompetitorQueue,
      analyticsPlatformAggregateQueue,
    } = await import('@/lib/queues/queues');

    const timestamp = Date.now();

    await Promise.all([
      analyticsChannelStatsQueue.add('force-sync-channel-stats', {}, {
        jobId: `force-channel-stats-${timestamp}`,
      }),
      analyticsDailySnapshotQueue.add('force-sync-daily-snapshot', {}, {
        jobId: `force-daily-snapshot-${timestamp}`,
      }),
      analyticsVideoQueue.add('force-sync-video-analytics', {}, {
        jobId: `force-video-analytics-${timestamp}`,
      }),
      analyticsDemographicsQueue.add('force-sync-demographics', {}, {
        jobId: `force-demographics-${timestamp}`,
      }),
      analyticsCompetitorQueue.add('force-sync-competitors', {}, {
        jobId: `force-competitors-${timestamp}`,
      }),
      analyticsPlatformAggregateQueue.add('force-sync-platform-aggregate', {}, {
        jobId: `force-platform-aggregate-${timestamp}`,
      }),
    ]);

    console.log('[Analytics Force Sync] Admin triggered full re-sync:', auth.user.id);

    return NextResponse.json({
      success: true,
      message: 'All 6 analytics workers queued for immediate sync.',
      queued: [
        'channel-stats',
        'daily-snapshot',
        'video-analytics',
        'demographics',
        'competitors',
        'platform-aggregate',
      ],
    });
  } catch (err) {
    console.error('[Analytics Force Sync] Failed:', err);
    return NextResponse.json({ error: 'Failed to enqueue sync' }, { status: 500 });
  }
}
