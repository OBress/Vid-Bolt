// Spine module exports
export { generateSpine } from './index';
export type { SpineGenerationOptions, SpineGenerationResult } from './index';
export { createBeatFromSpec, createEmptyBeat, isStructuralAnchor, isEarlyBeatType, isLateBeatType, getRecommendedPosition, validateBeatPosition, suggestBeatType, BEAT_TYPE_DESCRIPTIONS } from './beat-types';
export type { BeatSpec, BeatTiming } from './beat-types';
export { assignEngagementAnchors, validateEngagementMechanics, generateLoopId, areLoopsClosedByPosition } from './engagement-mechanics';
export type { EngagementValidation } from './engagement-mechanics';
export { getGenreTemplate, getRecommendedBeatTypesForPosition, getSectionNameForPosition } from './genre-templates';
export type { GenreTemplate, BeatStructure } from './genre-templates';
