/**
 * Video Editor Hooks - Public API
 * 
 * Export all hooks for the video editor.
 * All hooks use the unified VideoEditorStore directly.
 */

// Primary unified hook - recommended entry point
export { useTimeline, type UseTimelineReturn } from './use-timeline';

// Specialized hooks for specific use cases
export { useTimelineClips } from './use-timeline-clips';
export { useTrackManagement } from './use-timeline-tracks';
export { useProjectSync } from './use-project-sync';

// Re-export useTimelineTracks from advanced-timeline for UI rendering
// This version provides denormalized tracks with embedded clips (tracks.items[])
export { useTimelineTracks } from '../components/advanced-timeline/hooks/use-timeline-tracks';

// Re-export types
export type {
  UseProjectSyncOptions,
  ProjectSyncState,
} from './use-project-sync';
