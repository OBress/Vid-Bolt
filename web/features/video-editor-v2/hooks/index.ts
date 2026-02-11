/**
 * Video Editor Hooks - Public API
 *
 * Export all hooks for the video editor.
 * All hooks use the unified VideoEditorStore directly.
 *
 * For state access, prefer atomic selectors from video-editor-store.ts
 * (e.g. selectClips, selectFps) with useVideoEditorStore().
 * For actions, use useVideoEditorActions().
 */

// Specialized hooks
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
