/**
 * GPU Job Orchestrator
 * ============================================================================
 * Centralized GPU job submission with automatic VM readiness handling.
 * 
 * If VM is ready: queues immediately to BullMQ
 * If VM not ready: stores in pending_gpu_jobs table for later dispatch
 */

import { checkGpuVmReady } from './gpu-api-service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  assetReferenceImagesQueue,
  gpuImageCreateQueue,
  gpuImageEditQueue,
  gpuLtx2CreateQueue,
} from '@/lib/queues/queues';
import { Queue } from 'bullmq';

// ============================================================================
// TYPES
// ============================================================================

export type GpuJobType =
  | 'asset_reference_images'
  | 'image_generation'
  | 'image_editing'
  | 'video_generation';

export interface GpuJobSubmission {
  userId: string;
  videoId: string;
  jobType: GpuJobType;
  jobData: Record<string, unknown>;
  taskId?: string;
  priority?: number;
}

export interface GpuJobResult {
  queued: boolean;
  pending: boolean;
  jobId?: string;
  pendingJobId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const JOB_TYPE_TO_QUEUE: Record<GpuJobType, string> = {
  'asset_reference_images': 'asset-reference-images',
  'image_generation': 'gpu-image-create',
  'image_editing': 'gpu-image-edit',
  'video_generation': 'gpu-ltx2-create',
};

const JOB_TYPE_TO_QUEUE_INSTANCE: Record<GpuJobType, Queue> = {
  'asset_reference_images': assetReferenceImagesQueue,
  'image_generation': gpuImageCreateQueue,
  'image_editing': gpuImageEditQueue,
  'video_generation': gpuLtx2CreateQueue,
};

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Submit a GPU job with automatic VM readiness handling.
 * If VM is ready: queues immediately to BullMQ
 * If VM not ready: stores in pending_gpu_jobs for later dispatch
 */
export async function submitGpuJob(submission: GpuJobSubmission): Promise<GpuJobResult> {
  const {
    userId,
    videoId,
    jobType,
    jobData,
    taskId,
    priority = 0,
  } = submission;

  console.log(`[GpuOrchestrator] Submitting ${jobType} job for video ${videoId}`);

  // Check VM readiness
  const vmStatus = await checkGpuVmReady(userId);

  if (vmStatus.ready) {
    console.log(`[GpuOrchestrator] VM ready at ${vmStatus.ip}, queuing directly`);
    const jobId = await queueToMQ(jobType, jobData);
    return { queued: true, pending: false, jobId };
  }

  console.log(`[GpuOrchestrator] VM not ready (${vmStatus.reason}), storing as pending`);
  
  // Store as pending
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('pending_gpu_jobs')
    .insert({
      user_id: userId,
      video_id: videoId,
      job_type: jobType,
      target_queue: JOB_TYPE_TO_QUEUE[jobType],
      job_data: jobData,
      task_id: taskId || null,
      priority,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to store pending job: ${error.message}`);
  }

  // Update task status if provided
  if (taskId) {
    await supabase
      .from('tasks')
      .update({
        current_step: 'Waiting for GPU VM to become ready...',
      })
      .eq('id', taskId);
  }

  console.log(`[GpuOrchestrator] Stored pending job ${data.id}`);
  return { queued: false, pending: true, pendingJobId: data.id };
}

/**
 * Queue a job directly to BullMQ (bypasses pending logic).
 * Used when VM is confirmed ready.
 */
export async function queueToMQ(
  jobType: GpuJobType,
  jobData: Record<string, unknown>
): Promise<string> {
  const queue = JOB_TYPE_TO_QUEUE_INSTANCE[jobType];
  const jobId = `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const job = await queue.add('generate', jobData, {
    jobId,
  });

  console.log(`[GpuOrchestrator] Queued job ${job.id} to ${JOB_TYPE_TO_QUEUE[jobType]}`);
  return job.id!;
}

/**
 * Dispatch all pending jobs for a user.
 * Called when VM becomes ready (from GCP startup webhook).
 */
export async function dispatchPendingJobs(userId: string): Promise<{
  dispatched: number;
  failed: number;
  results: Array<{ id: string; status: 'dispatched' | 'failed'; jobId?: string; error?: string }>;
}> {
  const supabase = getSupabaseServiceClient();

  console.log(`[GpuOrchestrator] Dispatching pending jobs for user ${userId}`);

  // Query pending jobs (oldest first, respect priority)
  const { data: pendingJobs, error: fetchError } = await supabase
    .from('pending_gpu_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch pending jobs: ${fetchError.message}`);
  }

  if (!pendingJobs || pendingJobs.length === 0) {
    console.log(`[GpuOrchestrator] No pending jobs found for user ${userId}`);
    return { dispatched: 0, failed: 0, results: [] };
  }

  console.log(`[GpuOrchestrator] Found ${pendingJobs.length} pending jobs`);

  const results: Array<{ id: string; status: 'dispatched' | 'failed'; jobId?: string; error?: string }> = [];
  let dispatched = 0;
  let failed = 0;

  // Dispatch each job
  for (const job of pendingJobs) {
    try {
      const jobId = await queueToMQ(job.job_type as GpuJobType, job.job_data);
      
      await supabase
        .from('pending_gpu_jobs')
        .update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      results.push({ id: job.id, status: 'dispatched', jobId });
      dispatched++;
      
      console.log(`[GpuOrchestrator] Dispatched pending job ${job.id} -> ${jobId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      await supabase
        .from('pending_gpu_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', job.id);

      results.push({ id: job.id, status: 'failed', error: errorMessage });
      failed++;
      
      console.error(`[GpuOrchestrator] Failed to dispatch job ${job.id}: ${errorMessage}`);
    }
  }

  console.log(`[GpuOrchestrator] Dispatch complete: ${dispatched} dispatched, ${failed} failed`);
  return { dispatched, failed, results };
}

/**
 * Get count of pending jobs for a user
 */
export async function getPendingJobCount(userId: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  
  const { count, error } = await supabase
    .from('pending_gpu_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error(`[GpuOrchestrator] Error getting pending count: ${error.message}`);
    return 0;
  }

  return count || 0;
}
