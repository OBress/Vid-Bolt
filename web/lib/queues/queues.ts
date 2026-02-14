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

/** GPU music generation (ACE-Step 1.5) */
export const gpuMusicCreateQueue = createQueue('gpu-music-create');

/** GPU sound effect generation (AudioGen) */
export const gpuSfxCreateQueue = createQueue('gpu-sfx-create');

// ============================================================================
// QUEUE UTILITIES
// ============================================================================

/** GCP Provisioning Queue */
export const gcpProvisioningQueue = createQueue('gcp-provisioning-queue');

/** Video segmentation for stock media library */
export const videoSegmentationQueue = createQueue('video-segmentation');

/** Stock media scraping with classification */
export const stockMediaQueue = createQueue('stock-media-scrape');

/** AI reference image generation for video assets */
export const assetReferenceImagesQueue = createQueue('asset-reference-images');

/** Research comparison/testing for dev tools */
export const researchCompareQueue = createQueue('research-compare');

/** GPU VM inactivity shutdown checker (repeatable) */
export const gpuShutdownCheckQueue = createQueue('gpu-shutdown-check');

/** Video rendering via Remotion Lambda → Cloudflare R2 */
export const videoRenderQueue = createQueue('video-render', {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50, age: 60 * 60 * 24 * 3 },  // 3 days
    removeOnFail: { count: 200, age: 60 * 60 * 24 * 14 },    // 14 days
  },
});

/** AI-driven edit assembly (chunked EDL generation) */
export const editAssemblyQueue = createQueue('edit-assembly-workflow');

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
  gpuMusicCreateQueue,
  gpuSfxCreateQueue,
  gcpProvisioningQueue,
  videoSegmentationQueue,
  stockMediaQueue,
  assetReferenceImagesQueue,
  researchCompareQueue,
  gpuShutdownCheckQueue,
  videoRenderQueue,
  editAssemblyQueue,
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

