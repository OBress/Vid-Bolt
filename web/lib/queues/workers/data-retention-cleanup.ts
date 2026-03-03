/**
 * Data Retention Cleanup Worker
 * ============================================================================
 * Automatically cleans up expired video project data from R2 storage and
 * Supabase. Runs as a BullMQ repeatable job every 6 hours.
 * 
 * Retention period is configurable via DATA_RETENTION_DAYS env var (default: 20).
 * 
 * Per video, this worker:
 *   1. Preserves a single thumbnail URL for historical display
 *   2. Deletes all R2 files under users/{userId}/videos/{videoId}/
 *   3. Deletes stock_media, render_jobs rows
 *   4. Deletes linked tasks (cascades to task_steps, continuity_state)
 *   5. Nullifies heavy JSONB columns on video_projects + video_project_state
 *   6. Marks video as cleanup_status='cleaned'
 */

import { Job, Processor } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { deleteFilesWithPrefix } from '../../services/r2-storage';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get the data retention period in days.
 * Reads from DATA_RETENTION_DAYS env var, defaults to 20.
 */
function getRetentionDays(): number {
  const envValue = process.env.DATA_RETENTION_DAYS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 20;
}

// ============================================================================
// Types
// ============================================================================

interface ExpiredVideo {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  script_task_id: string | null;
  audio_task_id: string | null;
  video_task_id: string | null;
  export_task_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface CleanupResult {
  videosFound: number;
  videosProcessed: number;
  videosFailed: number;
  r2FilesDeleted: number;
  r2Errors: string[];
  dbRowsDeleted: number;
}

// ============================================================================
// Core Cleanup Logic
// ============================================================================

/**
 * Find and clean up all expired video projects.
 */
export async function cleanupExpiredVideos(): Promise<CleanupResult> {
  const retentionDays = getRetentionDays();
  console.log(`[Data Retention] Starting cleanup (retention: ${retentionDays} days)...`);

  // Initialize Supabase with service role for full access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const result: CleanupResult = {
    videosFound: 0,
    videosProcessed: 0,
    videosFailed: 0,
    r2FilesDeleted: 0,
    r2Errors: [],
    dbRowsDeleted: 0,
  };

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  console.log(`[Data Retention] Cutoff date: ${cutoffISO}`);

  // Query expired videos that haven't been cleaned yet
  const { data: expiredVideos, error: queryError } = await supabase
    .from('video_projects')
    .select('id, user_id, name, created_at, script_task_id, audio_task_id, video_task_id, export_task_id, metadata')
    .lt('created_at', cutoffISO)
    .is('cleanup_status', null)
    .in('status', ['completed', 'failed', 'cancelled']);

  if (queryError) {
    console.error('[Data Retention] Failed to query expired videos:', queryError.message);
    return result;
  }

  if (!expiredVideos || expiredVideos.length === 0) {
    console.log('[Data Retention] No expired videos found');
    return result;
  }

  result.videosFound = expiredVideos.length;
  console.log(`[Data Retention] Found ${expiredVideos.length} expired video(s)`);

  // Process each expired video
  for (const video of expiredVideos as ExpiredVideo[]) {
    try {
      await cleanupSingleVideo(supabase, video, result);
      result.videosProcessed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Data Retention] Failed to cleanup video ${video.id} ("${video.name}"): ${errorMsg}`);
      result.videosFailed++;
    }
  }

  console.log(`[Data Retention] Cleanup complete:
  Videos found:     ${result.videosFound}
  Videos processed: ${result.videosProcessed}
  Videos failed:    ${result.videosFailed}
  R2 files deleted: ${result.r2FilesDeleted}
  R2 errors:        ${result.r2Errors.length}
  DB rows deleted:  ${result.dbRowsDeleted}`);

  return result;
}

/**
 * Clean up a single expired video project.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanupSingleVideo(supabase: any, video: ExpiredVideo, result: CleanupResult): Promise<void> {
  const { id: videoId, user_id: userId, name } = video;
  console.log(`[Data Retention] Cleaning up video ${videoId} ("${name}")...`);

  // ---- Step 1: Determine thumbnail to preserve ----
  let thumbnailUrl: string | null = null;
  
  // Try to extract existing thumbnail from metadata
  if (video.metadata) {
    // Check common metadata locations for a thumbnail
    const meta = video.metadata as Record<string, unknown>;
    if (typeof meta.thumbnail_url === 'string') {
      thumbnailUrl = meta.thumbnail_url;
    } else if (typeof meta.poster_url === 'string') {
      thumbnailUrl = meta.poster_url;
    }
  }

  // ---- Step 2: Delete all R2 files for this video ----
  const r2Prefix = `users/${userId}/videos/${videoId}/`;
  console.log(`[Data Retention] Deleting R2 prefix: ${r2Prefix}`);

  try {
    const r2Result = await deleteFilesWithPrefix(r2Prefix);
    result.r2FilesDeleted += r2Result.deleted;
    if (r2Result.errors.length > 0) {
      result.r2Errors.push(...r2Result.errors);
      console.warn(`[Data Retention] R2 deletion had ${r2Result.errors.length} error(s) for video ${videoId}`);
    }
    console.log(`[Data Retention] R2: Deleted ${r2Result.deleted} files for video ${videoId}`);
  } catch (r2Err) {
    const errMsg = r2Err instanceof Error ? r2Err.message : String(r2Err);
    result.r2Errors.push(`Video ${videoId}: ${errMsg}`);
    console.error(`[Data Retention] R2 deletion failed for video ${videoId}: ${errMsg}`);
    // Continue with DB cleanup even if R2 fails
  }

  // ---- Step 3: Delete stock_media rows ----
  const { count: stockMediaDeleted } = await supabase
    .from('stock_media')
    .delete({ count: 'exact' })
    .eq('video_id', videoId);
  
  if (stockMediaDeleted) {
    result.dbRowsDeleted += stockMediaDeleted;
    console.log(`[Data Retention] Deleted ${stockMediaDeleted} stock_media rows for video ${videoId}`);
  }

  // ---- Step 4: Delete render_jobs rows ----
  const { count: renderJobsDeleted } = await supabase
    .from('render_jobs')
    .delete({ count: 'exact' })
    .eq('video_id', videoId);
  
  if (renderJobsDeleted) {
    result.dbRowsDeleted += renderJobsDeleted;
    console.log(`[Data Retention] Deleted ${renderJobsDeleted} render_jobs rows for video ${videoId}`);
  }

  // ---- Step 5: Delete linked tasks (cascades to task_steps, continuity_state) ----
  const taskIds = [
    video.script_task_id,
    video.audio_task_id,
    video.video_task_id,
    video.export_task_id,
  ].filter((id): id is string => id !== null);

  if (taskIds.length > 0) {
    // Also find any tasks linked via project_id (tasks.project_id → media_projects)
    // that reference this video's parent project - but those are separate.
    // For now, just delete the directly-linked task IDs.
    const { count: tasksDeleted } = await supabase
      .from('tasks')
      .delete({ count: 'exact' })
      .in('id', taskIds);

    if (tasksDeleted) {
      result.dbRowsDeleted += tasksDeleted;
      console.log(`[Data Retention] Deleted ${tasksDeleted} tasks (+ cascaded task_steps, continuity_state) for video ${videoId}`);
    }
  }

  // ---- Step 6: Nullify heavy columns on video_project_state ----
  await supabase
    .from('video_project_state')
    .update({
      research_data: {},
      script_data: {},
      voice_data: {},
      timeline_data: {},
      export_settings: {},
      editor_preferences: {},
    })
    .eq('project_id', videoId);

  // ---- Step 7: Mark video_projects as cleaned + nullify heavy columns ----
  await supabase
    .from('video_projects')
    .update({
      cleanup_status: 'cleaned',
      cleaned_at: new Date().toISOString(),
      thumbnail_url: thumbnailUrl,
      // Nullify heavy JSONB/text columns
      metadata: {},
      script_content: null,
      closed_loop_state: null,
      worker_prompts: null,
      creative_manifest: null,
      // Clear task references (tasks are already deleted)
      script_task_id: null,
      audio_task_id: null,
      video_task_id: null,
      export_task_id: null,
    })
    .eq('id', videoId);

  console.log(`[Data Retention] ✓ Video ${videoId} ("${name}") cleanup complete`);
}

// ============================================================================
// BullMQ Processor
// ============================================================================

export const dataRetentionCleanupProcessor: Processor = async (job: Job) => {
  console.log(`[Data Retention] Job ${job.id} started`);
  const result = await cleanupExpiredVideos();
  return { success: true, ...result };
};
