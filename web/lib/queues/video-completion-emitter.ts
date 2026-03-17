/**
 * Video Completion Emitter
 * ============================================================================
 * In-process EventEmitter for streaming per-shot video completion events from
 * the video-gen worker to the orchestrator.
 *
 * Both workers run in the same Node.js process (BullMQ workers), so we can use
 * a simple EventEmitter instead of Redis pub/sub. Events are scoped by videoId
 * to prevent cross-pipeline interference.
 *
 * Usage:
 *   video-gen worker (emitter):
 *     emitVideoItemComplete(videoId, result)
 *
 *   orchestrator (listener):
 *     onVideoItemComplete(videoId, callback)
 *     offVideoItemComplete(videoId)
 */

import { EventEmitter } from 'events';
import type { GpuGenerationResult } from '@/lib/av-script/gpu-batch-generation';

// Singleton emitter — shared across all workers in the process
const emitter = new EventEmitter();
emitter.setMaxListeners(100); // Support many concurrent pipelines

/** Event name scoped by videoId */
function eventName(videoId: string): string {
  return `video-item-complete:${videoId}`;
}

export type VideoItemCompleteCallback = (result: GpuGenerationResult) => void;

/**
 * Emit a per-shot completion event. Called by video-gen worker
 * each time a single video's webhook resolves.
 */
export function emitVideoItemComplete(
  videoId: string,
  result: GpuGenerationResult
): void {
  emitter.emit(eventName(videoId), result);
}

/**
 * Subscribe to per-shot completion events for a specific video.
 * Called by the orchestrator before dispatching video-gen.
 */
export function onVideoItemComplete(
  videoId: string,
  callback: VideoItemCompleteCallback
): void {
  emitter.on(eventName(videoId), callback);
}

/**
 * Unsubscribe all listeners for a specific video.
 * Called by the orchestrator after all verification is complete.
 */
export function offVideoItemComplete(videoId: string): void {
  emitter.removeAllListeners(eventName(videoId));
}
