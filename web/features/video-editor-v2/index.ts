/**
 * Video Editor V2 - Public API
 * 
 * Re-exports the main components, stores, hooks, and types
 * for external consumption.
 */

// Main component
export { ReactVideoEditorV2, default } from './components/react-video-editor-v2';
export type { ReactVideoEditorV2Props } from './components/react-video-editor-v2';

// Stores (contains AspectRatio and ResolutionPreset types)
export * from './stores';

// Hooks
export * from './hooks';

// Utils
export { HttpRenderer } from './utils/http-renderer';

// Note: Types are not re-exported to avoid duplicate exports
// Import directly from '@/features/video-editor-v2/types' if needed

