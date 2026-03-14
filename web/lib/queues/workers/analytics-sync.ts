/**
 * Analytics Sync Workers
 * ============================================================================
 * BullMQ processors for scheduled YouTube analytics data synchronization.
 *
 * Each processor iterates over users with linked channels, gets a valid
 * GCP token via getValidGCPToken(), and makes YouTube API calls against
 * the user's own GCP project quota (10,000 units/day per user).
 *
 * Workers:
 *   - channelStatsSyncProcessor    (every 6 hours)
 *   - dailySnapshotSyncProcessor   (daily 2 AM UTC)
 *   - videoAnalyticsSyncProcessor  (daily 3 AM UTC)
 *   - demographicsSyncProcessor    (weekly Sunday 4 AM UTC)
 *   - competitorSyncProcessor      (daily 5 AM UTC)
 *   - platformDailyAggregateProcessor (daily 6 AM UTC)
 */

import { Job, Processor } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getValidGCPToken, getValidYouTubeToken, refreshGoogleAccessToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { YouTubeAnalyticsApi } from '@/lib/youtube/analytics-api';

// ============================================================================
// Helpers
// ============================================================================

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface _SyncContext {
  userId: string;
  channelDbId: string;
  channelYtId: string;
  accessToken: string;
  projectId?: string;
}

/**
 * Get a user's GCP project ID for quota billing.
 */
async function getUserProjectId(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('user_gcp_config')
    .select('project_id')
    .eq('user_id', userId)
    .single();
  return data?.project_id ?? undefined;
}

/**
 * Get a valid access token from a social connection (YouTube OAuth flow).
 * Falls back to getValidGCPToken if no connection_id is available.
 */
async function getConnectionToken(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string,
  connectionId?: string | null,
): Promise<{ token: string; isSocialConnection: boolean }> {
  if (!connectionId) {
    console.log(`[AnalyticsSync] No connection_id for user ${userId}, using YouTube token`);
    return { token: await getValidYouTubeToken(userId), isSocialConnection: false };
  }

  const { data: conn } = await supabase
    .from('social_connections')
    .select('refresh_token, access_token, token_expires_at, provider, provider_name')
    .eq('id', connectionId)
    .single();

  if (!conn || !conn.refresh_token) {
    console.log(`[AnalyticsSync] Connection ${connectionId} has no refresh_token, using YouTube token`);
    return { token: await getValidYouTubeToken(userId), isSocialConnection: false };
  }

  console.log(`[AnalyticsSync] Using social connection token for user ${userId} (${conn.provider} / ${conn.provider_name})`);

  // Check if cached token is still valid (with 5-min buffer)
  const isExpired = !conn.token_expires_at ||
    new Date(conn.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000);

  if (conn.access_token && !isExpired) {
    return { token: conn.access_token, isSocialConnection: true };
  }

  // Refresh the token
  console.log(`[AnalyticsSync] Refreshing social connection token...`);
  const refreshed = await refreshGoogleAccessToken(conn.refresh_token);

  // Cache the refreshed token
  await supabase
    .from('social_connections')
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  return { token: refreshed.accessToken, isSocialConnection: true };
}

/**
 * Log a sync operation to analytics_sync_log.
 */
async function _logSync(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string,
  channelId: string | null,
  syncType: string,
  status: 'running' | 'completed' | 'failed',
  recordsSynced: number = 0,
  quotaUsed: number = 0,
  errorMessage: string | null = null,
  startedAt?: Date,
): Promise<string | null> {
  const now = new Date();
  const entry: Record<string, unknown> = {
    user_id: userId,
    channel_id: channelId,
    sync_type: syncType,
    status,
    records_synced: recordsSynced,
    quota_used: quotaUsed,
    error_message: errorMessage,
  };

  if (status === 'running') {
    entry.started_at = now.toISOString();
  } else {
    entry.completed_at = now.toISOString();
    if (startedAt) {
      entry.duration_ms = now.getTime() - startedAt.getTime();
    }
  }

  const { data } = await supabase
    .from('analytics_sync_log')
    .insert(entry)
    .select('id')
    .single();

  return data?.id ?? null;
}

/**
 * Update a sync log entry with completion status.
 */
async function _updateSyncLog(
  supabase: ReturnType<typeof getServiceSupabase>,
  logId: string,
  status: 'completed' | 'failed',
  recordsSynced: number,
  quotaUsed: number,
  errorMessage: string | null = null,
  startedAt?: Date,
) {
  const now = new Date();
  await supabase
    .from('analytics_sync_log')
    .update({
      status,
      records_synced: recordsSynced,
      quota_used: quotaUsed,
      error_message: errorMessage,
      completed_at: now.toISOString(),
      duration_ms: startedAt ? now.getTime() - startedAt.getTime() : null,
    })
    .eq('id', logId);
}

/**
 * Gather all users with linked YouTube channels.
 */
async function getUserChannels(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<Array<{ user_id: string; channels: Array<{ id: string; channel_id: string; connection_id: string | null }> }>> {
  const { data, error } = await supabase
    .from('youtube_channels')
    .select('id, user_id, channel_id, connection_id')
    .order('user_id');

  if (error || !data) return [];

  // Group by user
  const byUser = new Map<string, Array<{ id: string; channel_id: string; connection_id: string | null }>>();
  for (const row of data) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push({ id: row.id, channel_id: row.channel_id, connection_id: row.connection_id });
  }

  return Array.from(byUser.entries()).map(([user_id, channels]) => ({ user_id, channels }));
}

// ============================================================================
// 1. Channel Stats Sync (every 6 hours)
// ============================================================================

async function syncChannelStats(): Promise<{ usersProcessed: number; channelsUpdated: number }> {
  const supabase = getServiceSupabase();
  const users = await getUserChannels(supabase);
  let channelsUpdated = 0;

  for (const { user_id, channels } of users) {
    try {
      const pid = await getUserProjectId(supabase, user_id);

      for (const ch of channels) {
        try {
          const { token, isSocialConnection } = await getConnectionToken(supabase, user_id, ch.connection_id);
          const api = new YouTubeApi(token, isSocialConnection ? undefined : pid);
          const myChannels = await api.getMyChannels();
          const ytChannel = myChannels.find((c) => c.id === ch.channel_id);
          if (!ytChannel) continue;

        await supabase
          .from('youtube_channels')
          .update({
            channel_title: ytChannel.title,
            channel_handle: ytChannel.handle,
            thumbnail_url: ytChannel.thumbnailUrl,
            subscriber_count: ytChannel.subscriberCount,
            view_count: ytChannel.viewCount,
            video_count: ytChannel.videoCount,
            custom_url: ytChannel.customUrl,
            last_synced_at: new Date().toISOString(),
            sync_status: 'synced',
            sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ch.id);

          channelsUpdated++;
        } catch (chErr) {
          console.error(`[AnalyticsSync] Channel stats failed for channel ${ch.channel_id}: ${chErr instanceof Error ? chErr.message : chErr}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AnalyticsSync] Channel stats failed for user ${user_id}: ${msg}`);

      // Mark channels as error
      for (const ch of channels) {
        await supabase
          .from('youtube_channels')
          .update({ sync_status: 'error', sync_error: msg })
          .eq('id', ch.id);
      }
    }

    await delay(100); // Rate limit between users
  }

  return { usersProcessed: users.length, channelsUpdated };
}

export const channelStatsSyncProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Channel stats sync job ${job.id} started`);
  const result = await syncChannelStats();
  console.log(`[AnalyticsSync] Channel stats sync complete: ${result.channelsUpdated} channels updated across ${result.usersProcessed} users`);
  return { success: true, ...result };
};

// ============================================================================
// 2. Daily Snapshot Sync (Daily 2 AM UTC)
// ============================================================================

async function syncDailySnapshots(): Promise<{ usersProcessed: number; snapshotsCreated: number }> {
  const supabase = getServiceSupabase();
  const users = await getUserChannels(supabase);
  const _today = formatDate(new Date());
  const yesterday = getDaysAgo(1);
  let snapshotsCreated = 0;

  for (const { user_id, channels } of users) {
    try {
      const pid = await getUserProjectId(supabase, user_id);

      for (const ch of channels) {
        try {
          const { token, isSocialConnection } = await getConnectionToken(supabase, user_id, ch.connection_id);
          const analyticsApi = new YouTubeAnalyticsApi(token, isSocialConnection ? undefined : pid);

          // Check if this channel has existing snapshots — if not, backfill 30 days
          const { count: existingCount } = await supabase
            .from('youtube_channel_snapshots')
            .select('id', { count: 'exact', head: true })
            .eq('channel_id', ch.id);

          const needsBackfill = (existingCount ?? 0) < 60;
          const startDate = needsBackfill ? getDaysAgo(365) : yesterday;
          const endDate = yesterday;

          if (needsBackfill) {
            console.log(`[AnalyticsSync] Backfilling 365 days of snapshots for channel ${ch.channel_id}`);
          }

          // Fetch daily metrics from YouTube Analytics API (supports date ranges)
          const report = await analyticsApi.getChannelMetrics(
            startDate,
            endDate,
            ['views', 'estimatedMinutesWatched', 'subscribersGained', 'subscribersLost',
             'averageViewDuration', 'likes', 'dislikes', 'comments', 'shares'],
            'day',
          );

          // Get revenue if available
          const revenueByDate: Record<string, number> = {};
          try {
            const revenueReport = await analyticsApi.getRevenue(startDate, endDate);
            for (const row of revenueReport.rows) {
              const d = row.day as string;
              if (d) revenueByDate[d] = (row.estimatedRevenue as number) ?? 0;
            }
          } catch {
            // Revenue not available — not monetized
          }

          // Insert each day's data as a separate snapshot
          for (const row of report.rows) {
            const dayStr = (row.day as string) || yesterday;

            await supabase
              .from('youtube_channel_snapshots')
              .upsert({
                channel_id: ch.id,
                snapshot_date: dayStr,
                subscriber_count: null,
                view_count: null,
                video_count: null,
                estimated_revenue: revenueByDate[dayStr] ?? null,
                views_day: (row.views as number) ?? 0,
                subscribers_gained: (row.subscribersGained as number) ?? 0,
                subscribers_lost: (row.subscribersLost as number) ?? 0,
                estimated_minutes_watched: (row.estimatedMinutesWatched as number) ?? 0,
                average_view_duration: (row.averageViewDuration as number) ?? null,
                likes: (row.likes as number) ?? 0,
                dislikes: (row.dislikes as number) ?? 0,
                comments: (row.comments as number) ?? 0,
                shares: (row.shares as number) ?? 0,
              }, { onConflict: 'channel_id,snapshot_date' });

            snapshotsCreated++;
          }

          // Update the latest channel stats on yesterday's snapshot
          const { data: channelData } = await supabase
            .from('youtube_channels')
            .select('subscriber_count, view_count, video_count')
            .eq('id', ch.id)
            .single();

          if (channelData) {
            await supabase
              .from('youtube_channel_snapshots')
              .update({
                subscriber_count: channelData.subscriber_count,
                view_count: channelData.view_count,
                video_count: channelData.video_count,
              })
              .eq('channel_id', ch.id)
              .eq('snapshot_date', yesterday);
          }

          snapshotsCreated++;
        } catch (err) {
          console.error(`[AnalyticsSync] Daily snapshot failed for channel ${ch.channel_id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.error(`[AnalyticsSync] Daily snapshot failed for user ${user_id}: ${err instanceof Error ? err.message : err}`);
    }

    await delay(100);
  }

  return { usersProcessed: users.length, snapshotsCreated };
}

export const dailySnapshotSyncProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Daily snapshot sync job ${job.id} started`);
  const result = await syncDailySnapshots();
  console.log(`[AnalyticsSync] Daily snapshot sync complete: ${result.snapshotsCreated} snapshots`);
  return { success: true, ...result };
};

// ============================================================================
// 3. Video Analytics Sync (Daily 3 AM UTC)
// ============================================================================

async function syncVideoAnalytics(): Promise<{ usersProcessed: number; videosUpdated: number }> {
  const supabase = getServiceSupabase();
  const users = await getUserChannels(supabase);
  let videosUpdated = 0;

  for (const { user_id, channels } of users) {
    try {
      const pid = await getUserProjectId(supabase, user_id);

      for (const ch of channels) {
        try {
          const { token, isSocialConnection } = await getConnectionToken(supabase, user_id, ch.connection_id);
          const api = new YouTubeApi(token, isSocialConnection ? undefined : pid);
          const analyticsApi = new YouTubeAnalyticsApi(token, isSocialConnection ? undefined : pid);
          // Get top 50 videos by views in last 90 days
          const startDate = getDaysAgo(90);
          const endDate = formatDate(new Date());

          const report = await analyticsApi.getTopVideos(startDate, endDate, 50);

          // Get video IDs from report
          const videoIds = report.rows.map((r) => r.video as string).filter(Boolean);
          if (videoIds.length === 0) continue;

          // Get video metadata from Data API
          const videoDetails = await api.getMultipleVideoDetails(videoIds);
          const detailsMap = new Map(videoDetails.map((v) => [v.id, v]));

          // Upsert video analytics
          for (const row of report.rows) {
            const videoId = row.video as string;
            if (!videoId) continue;

            const detail = detailsMap.get(videoId);

            await supabase
              .from('youtube_video_analytics')
              .upsert({
                channel_id: ch.id,
                video_id: videoId,
                title: detail?.title ?? null,
                published_at: detail?.publishedAt ?? null,
                thumbnail_url: detail?.thumbnailUrl ?? null,
                duration_seconds: detail?.durationSeconds ?? null,
                views: (row.views as number) ?? 0,
                likes: (row.likes as number) ?? 0,
                comments: (row.comments as number) ?? 0,
                shares: (row.shares as number) ?? 0,
                estimated_minutes_watched: (row.estimatedMinutesWatched as number) ?? 0,
                average_view_duration: (row.averageViewDuration as number) ?? null,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'channel_id,video_id' });

            videosUpdated++;
          }
        } catch (err) {
          console.error(`[AnalyticsSync] Video analytics failed for channel ${ch.channel_id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.error(`[AnalyticsSync] Video analytics failed for user ${user_id}: ${err instanceof Error ? err.message : err}`);
    }

    await delay(100);
  }

  return { usersProcessed: users.length, videosUpdated };
}

export const videoAnalyticsSyncProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Video analytics sync job ${job.id} started`);
  const result = await syncVideoAnalytics();
  console.log(`[AnalyticsSync] Video analytics sync complete: ${result.videosUpdated} videos`);
  return { success: true, ...result };
};

// ============================================================================
// 4. Demographics Sync (Weekly Sunday 4 AM UTC)
// ============================================================================

async function syncDemographics(): Promise<{ usersProcessed: number; demographicsUpdated: number }> {
  const supabase = getServiceSupabase();
  const users = await getUserChannels(supabase);
  const today = formatDate(new Date());
  const startDate = getDaysAgo(28);
  let demographicsUpdated = 0;

  for (const { user_id, channels } of users) {
    try {
      const pid = await getUserProjectId(supabase, user_id);

      for (const ch of channels) {
        try {
          const { token, isSocialConnection } = await getConnectionToken(supabase, user_id, ch.connection_id);
          const analyticsApi = new YouTubeAnalyticsApi(token, isSocialConnection ? undefined : pid);
          // Fetch all demographic breakdowns
          const [ageGender, traffic, devices, os, geo] = await Promise.all([
            analyticsApi.getAudienceDemographics(startDate, today),
            analyticsApi.getTrafficSources(startDate, today),
            analyticsApi.getDeviceBreakdown(startDate, today),
            analyticsApi.getOSBreakdown(startDate, today),
            analyticsApi.getGeography(startDate, today),
          ]);

          // Transform age/gender data into structured format
          const ageGenderData: Record<string, Record<string, number>> = {};
          for (const row of ageGender.rows) {
            const ageGroup = row.ageGroup as string;
            const gender = row.gender as string;
            const pct = row.viewerPercentage as number;
            if (!ageGenderData[ageGroup]) ageGenderData[ageGroup] = {};
            ageGenderData[ageGroup][gender] = pct;
          }

          // Transform traffic data
          const trafficData: Record<string, number> = {};
          for (const row of traffic.rows) {
            trafficData[row.insightTrafficSourceType as string] = row.views as number;
          }

          // Transform device data
          const deviceData: Record<string, number> = {};
          for (const row of devices.rows) {
            deviceData[row.deviceType as string] = row.views as number;
          }

          // Transform OS data
          const osData: Record<string, number> = {};
          for (const row of os.rows) {
            osData[row.operatingSystem as string] = row.views as number;
          }

          // Transform geo data
          const countryData: Record<string, number> = {};
          for (const row of geo.rows) {
            countryData[row.country as string] = row.views as number;
          }

          await supabase
            .from('youtube_audience_demographics')
            .upsert({
              channel_id: ch.id,
              snapshot_date: today,
              age_gender_data: ageGenderData,
              country_data: countryData,
              device_data: deviceData,
              traffic_data: trafficData,
              os_data: osData,
            }, { onConflict: 'channel_id,snapshot_date' });

          demographicsUpdated++;
        } catch (err) {
          console.error(`[AnalyticsSync] Demographics failed for channel ${ch.channel_id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.error(`[AnalyticsSync] Demographics failed for user ${user_id}: ${err instanceof Error ? err.message : err}`);
    }

    await delay(100);
  }

  return { usersProcessed: users.length, demographicsUpdated };
}

export const demographicsSyncProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Demographics sync job ${job.id} started`);
  const result = await syncDemographics();
  console.log(`[AnalyticsSync] Demographics sync complete: ${result.demographicsUpdated} demographics`);
  return { success: true, ...result };
};

// ============================================================================
// 5. Competitor Sync (Daily 5 AM UTC)
// ============================================================================

async function syncCompetitors(): Promise<{ usersProcessed: number; competitorsUpdated: number; snapshotsCreated: number }> {
  const supabase = getServiceSupabase();
  const today = formatDate(new Date());
  let competitorsUpdated = 0;
  let snapshotsCreated = 0;

  // Get all users who have tracked competitors
  const { data: competitors, error } = await supabase
    .from('competitor_channels')
    .select('id, user_id, channel_id')
    .order('user_id');

  if (error || !competitors || competitors.length === 0) {
    return { usersProcessed: 0, competitorsUpdated: 0, snapshotsCreated: 0 };
  }

  // Group by user
  const byUser = new Map<string, Array<{ id: string; channel_id: string }>>();
  for (const c of competitors) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id)!.push({ id: c.id, channel_id: c.channel_id });
  }

  for (const [userId, userCompetitors] of byUser) {
    try {
      const token = await getValidGCPToken(userId);
      const pid = await getUserProjectId(supabase, userId);
      const api = new YouTubeApi(token, pid);

      for (const comp of userCompetitors) {
        try {
          const channelInfo = await api.getChannelById(comp.channel_id);
          if (!channelInfo) continue;

          // Get recent videos for engagement stats
          const recentVideos = await api.getChannelVideos(channelInfo.uploadsPlaylistId, 10);
          const videoIds = recentVideos.items.map((v) => v.videoId);
          const videoDetails = videoIds.length > 0 ? await api.getMultipleVideoDetails(videoIds) : [];

          // Compute engagement metrics
          const totalViews = videoDetails.reduce((s, v) => s + v.viewCount, 0);
          const totalLikes = videoDetails.reduce((s, v) => s + v.likeCount, 0);
          const totalComments = videoDetails.reduce((s, v) => s + v.commentCount, 0);
          const avgViews = videoDetails.length > 0 ? Math.round(totalViews / videoDetails.length) : 0;
          const avgLikes = videoDetails.length > 0 ? Math.round(totalLikes / videoDetails.length) : 0;
          const avgComments = videoDetails.length > 0 ? Math.round(totalComments / videoDetails.length) : 0;
          const engagementRate = totalViews > 0 ? (totalLikes + totalComments) / totalViews : 0;

          // Compute upload frequency (videos per week)
          let uploadFrequency = 0;
          if (videoDetails.length >= 2) {
            const dates = videoDetails.map((v) => new Date(v.publishedAt).getTime()).sort();
            const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
            if (spanDays > 0) {
              uploadFrequency = parseFloat(((videoDetails.length / spanDays) * 7).toFixed(2));
            }
          }

          // Update competitor channel
          await supabase
            .from('competitor_channels')
            .update({
              channel_title: channelInfo.title,
              channel_handle: channelInfo.handle,
              thumbnail_url: channelInfo.thumbnailUrl,
              banner_url: channelInfo.bannerUrl,
              subscriber_count: channelInfo.subscriberCount,
              view_count: channelInfo.viewCount,
              video_count: channelInfo.videoCount,
              avg_views_per_video: avgViews,
              upload_frequency: uploadFrequency,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', comp.id);

          competitorsUpdated++;

          // Create daily snapshot
          await supabase
            .from('competitor_channel_snapshots')
            .upsert({
              competitor_id: comp.id,
              snapshot_date: today,
              subscriber_count: channelInfo.subscriberCount,
              view_count: channelInfo.viewCount,
              video_count: channelInfo.videoCount,
              recent_avg_views: avgViews,
              recent_avg_likes: avgLikes,
              recent_avg_comments: avgComments,
              engagement_rate: engagementRate,
            }, { onConflict: 'competitor_id,snapshot_date' });

          snapshotsCreated++;
        } catch (err) {
          console.error(`[AnalyticsSync] Competitor sync failed for ${comp.channel_id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.error(`[AnalyticsSync] Competitor sync failed for user ${userId}: ${err instanceof Error ? err.message : err}`);
    }

    await delay(100);
  }

  return { usersProcessed: byUser.size, competitorsUpdated, snapshotsCreated };
}

export const competitorSyncProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Competitor sync job ${job.id} started`);
  const result = await syncCompetitors();
  console.log(`[AnalyticsSync] Competitor sync complete: ${result.competitorsUpdated} competitors, ${result.snapshotsCreated} snapshots`);
  return { success: true, ...result };
};

// ============================================================================
// 6. Platform Daily Aggregate (Daily 6 AM UTC) — Admin only
// ============================================================================

async function syncPlatformDailyAggregate(): Promise<{ date: string }> {
  const supabase = getServiceSupabase();
  const today = formatDate(new Date());

  // User metrics
  const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: activeUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: pendingUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'pending');

  // New users today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: newUsersToday } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  // Video project metrics
  const { count: videosCreated } = await supabase
    .from('video_projects')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  const { count: videosCompleted } = await supabase
    .from('video_projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('updated_at', todayStart.toISOString());

  // Render metrics
  const { count: rendersCompleted } = await supabase
    .from('render_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString());

  const { count: rendersFailed } = await supabase
    .from('render_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', todayStart.toISOString());

  // YouTube aggregate — sum across all user channels
  const { data: ytAgg } = await supabase
    .from('youtube_channels')
    .select('subscriber_count, view_count, video_count');

  const totalYtSubs = ytAgg?.reduce((s, c) => s + (c.subscriber_count || 0), 0) ?? 0;
  const totalYtViews = ytAgg?.reduce((s, c) => s + (c.view_count || 0), 0) ?? 0;
  const totalYtVideos = ytAgg?.reduce((s, c) => s + (c.video_count || 0), 0) ?? 0;

  // Sync error count
  const { count: apiErrors } = await supabase
    .from('analytics_sync_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('started_at', todayStart.toISOString());

  await supabase
    .from('platform_analytics_daily')
    .upsert({
      snapshot_date: today,
      total_users: totalUsers ?? 0,
      active_users: activeUsers ?? 0,
      pending_users: pendingUsers ?? 0,
      new_users_today: newUsersToday ?? 0,
      videos_created: videosCreated ?? 0,
      videos_completed: videosCompleted ?? 0,
      renders_completed: rendersCompleted ?? 0,
      renders_failed: rendersFailed ?? 0,
      total_yt_views: totalYtViews,
      total_yt_subs: totalYtSubs,
      total_yt_videos: totalYtVideos,
      api_errors_count: apiErrors ?? 0,
    }, { onConflict: 'snapshot_date' });

  return { date: today };
}

export const platformDailyAggregateProcessor: Processor = async (job: Job) => {
  console.log(`[AnalyticsSync] Platform daily aggregate job ${job.id} started`);
  const result = await syncPlatformDailyAggregate();
  console.log(`[AnalyticsSync] Platform aggregate complete for ${result.date}`);
  return { success: true, ...result };
};
