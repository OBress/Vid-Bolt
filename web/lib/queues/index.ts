/**
 * Queue Module Index
 * ============================================================================
 * Re-exports queue utilities for external consumption.
 */

export { getRedisConnection, closeRedisConnection, isRedisReady } from './redis';
export { 
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
  editAssemblyQueue,
  allQueues, 
  closeAllQueues 
} from './queues';
export { 
  withRateLimitHandling, 
  waitIfRateLimited, 
  signalRateLimited,
  handleRateLimitError,
  sleep,
  calculateBackoff,
} from './rate-limiter';
export {
  getSupabaseServiceClient,
  addTaskStep,
  updateStepStatus,
  completeStep,
  failStep,
  updateTaskStatus,
  updateTaskOutput,
  appendChapter,
  updateContinuityState,
  getContinuityState,
} from './shared';
