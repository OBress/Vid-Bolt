/**
 * Store Utilities with Audio Cleanup
 * 
 * Wrapper functions for VideoEditorStore operations that ensure
 * proper audio resource cleanup before state changes.
 * 
 * Use these utilities when you need to call reset() or initialize()
 * from outside the EditorProvider context.
 */

import { useVideoEditorStore } from '../stores/video-editor-store';
import { cleanupAllAudioResources, cleanupClipAudioResources } from './audio-resource-manager';
import type { TimelineTrack, TimelineClip, TransitionEntity } from '../types/timeline-v2';
import type { AspectRatio, ResolutionPreset } from '../stores/video-editor-store';

/**
 * Reset the video editor store with proper audio cleanup
 * Call this instead of store.reset() to ensure no audio resources leak
 */
export function resetStoreWithCleanup(): void {
  console.log('[StoreWithCleanup] Resetting store with audio cleanup');
  
  // Clean up all audio resources first
  cleanupAllAudioResources();
  
  // Then reset the store
  useVideoEditorStore.getState().reset();
}

/**
 * Initialize the video editor store with proper audio cleanup
 * Call this instead of store.initialize() to ensure no audio resources leak
 */
export function initializeStoreWithCleanup(params: {
  projectId?: string;
  tracks?: TimelineTrack[];
  clips?: TimelineClip[];
  transitions?: Record<string, TransitionEntity>;
  fps?: number;
  aspectRatio?: AspectRatio;
  resolution?: ResolutionPreset;
  backgroundColor?: string;
}): void {
  console.log('[StoreWithCleanup] Initializing store with audio cleanup');
  
  // Clean up all audio resources from the previous state
  cleanupAllAudioResources();
  
  // Then initialize the store with new data
  useVideoEditorStore.getState().initialize(params);
}

/**
 * Delete a clip with explicit audio cleanup
 * The subscription should handle this automatically, but this is a safety wrapper
 */
export function deleteClipWithCleanup(clipId: string): void {
  // Clean up audio resources for this specific clip
  cleanupClipAudioResources(clipId);
  
  // Then delete the clip from the store
  useVideoEditorStore.getState().deleteClip(clipId);
}

/**
 * Delete multiple clips with explicit audio cleanup
 * The subscription should handle this automatically, but this is a safety wrapper
 */
export function deleteClipsWithCleanup(clipIds: string[]): void {
  // Clean up audio resources for each clip
  clipIds.forEach(clipId => cleanupClipAudioResources(clipId));
  
  // Then delete the clips from the store
  useVideoEditorStore.getState().deleteClips(clipIds);
}

/**
 * Set clips with proper audio cleanup for removed clips
 * Use this when replacing the entire clips array
 */
export function setClipsWithCleanup(newClips: TimelineClip[]): void {
  const store = useVideoEditorStore.getState();
  const currentClipsArr = Object.values(store.clips) as TimelineClip[];
  const newClipIds = new Set(newClips.map(c => c.id));
  
  // Find clips that will be removed
  const removedClipIds = currentClipsArr
    .filter(c => !newClipIds.has(c.id))
    .map(c => c.id);
  
  // Clean up audio resources for removed clips
  removedClipIds.forEach(clipId => cleanupClipAudioResources(clipId));
  
  // Then set the new clips
  store.setClips(newClips);
}
