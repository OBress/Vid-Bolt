/**
 * BullMQ Queue Definitions
 * ============================================================================
 * Defines all job queues used in the application.
 * Each queue has sensible defaults for retries, backoff, and job retention.
 */

import { Queue, type QueueOptions } from 'bullmq';
import { getRedisConnection } from './redis';

/**
 * Default options applied to all queues.
 * - 2 attempts = 1 retry (user requirement: "retry once before stopping")
 * - Exponential backoff starting at 2 seconds
 * - Completed jobs removed after 24 hours or 100 jobs
 * - Failed jobs kept for 7 days for debugging
 */
const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 100,
    age: 60 * 60 * 24, // 24 hours
  },
  removeOnFail: {
    count: 500,
    age: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Create a queue with default options.
 */
function createQueue(name: string, options?: Partial<QueueOptions>): Queue {
  return new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions,
    ...options,
  });
}

// ============================================================================
// WORKFLOW QUEUES
// ============================================================================

/** Script generation (research → outline → chapters → cleanup) */
export const writingQueue = createQueue('writing-workflow');

/** Universal script generation (6-phase pipeline) - DEPRECATED, use outline + scriptWriting */
export const universalScriptQueue = createQueue('universal-script-workflow');

/** Outline generation (phases 1-4: research, scoping, spine, assets) */
export const outlineQueue = createQueue('outline-workflow');

/** Script writing (phases 5-6: expansion, assembly) */
export const scriptWritingQueue = createQueue('script-writing-workflow');

/** TTS audio generation with chunked processing */
export const audioQueue = createQueue('audio-workflow');

/** AV script shot list generation */
export const avScriptQueue = createQueue('av-script-workflow');

/** Visual director (scene planning and media generation) */
export const visualDirectorQueue = createQueue('visual-director-workflow');

// ============================================================================
// GPU API TEST QUEUES
// ============================================================================

/** GPU image creation test */
export const gpuImageCreateQueue = createQueue('gpu-image-create');

/** GPU image editing test */
export const gpuImageEditQueue = createQueue('gpu-image-edit');

/** GPU video creation test */
export const gpuVideoCreateQueue = createQueue('gpu-video-create');

/** GPU LTX-2 video generation */
export const gpuLtx2CreateQueue = createQueue('gpu-ltx2-create');

/** GPU LTX-2 keyframe interpolation */
export const gpuLtx2InterpolateQueue = createQueue('gpu-ltx2-interpolate');

// ============================================================================
// QUEUE UTILITIES
// ============================================================================

/** GCP Provisioning Queue */
export const gcpProvisioningQueue = createQueue('gcp-provisioning-queue');

/** Video segmentation for stock media library */
export const videoSegmentationQueue = createQueue('video-segmentation');

/** Stock media scraping with classification */
export const stockMediaQueue = createQueue('stock-media-scrape');

/**
 * All active queues for graceful shutdown.
 */
export const allQueues = [
  writingQueue,
  universalScriptQueue,
  outlineQueue,
  scriptWritingQueue,
  audioQueue,
  avScriptQueue,
  visualDirectorQueue,
  gpuImageCreateQueue,
  gpuImageEditQueue,
  gpuVideoCreateQueue,
  gpuLtx2CreateQueue,
  gpuLtx2InterpolateQueue,
  gcpProvisioningQueue,
  videoSegmentationQueue,
  stockMediaQueue,
];

/**
 * Close all queues gracefully.
 * Call this during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  console.log('[Queues] Closing all queues...');
  await Promise.all(allQueues.map(q => q.close()));
  console.log('[Queues] All queues closed');
}

