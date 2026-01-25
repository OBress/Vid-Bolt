/**
 * Query Generator Module
 * ============================================================================
 * Exports for the media query generation system.
 */

// Types
export * from './types';

// Classifier
export { classifyScene, classifySceneBatch } from './classifier';

// Deduplicator
export {
  createVideoTracker,
  checkDuplicate,
  addToTracker,
  getTrackerQueries,
  getQueriesBySource,
  getTrackerStats,
} from './deduplicator';

// Generator
export {
  generateQueries,
  generateQueriesForScene,
  convertToSceneInputs,
} from './generator';
