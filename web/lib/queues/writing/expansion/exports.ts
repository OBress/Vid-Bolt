// Expansion module exports
export { expandSpineToScript, expandBeatsInParallel } from './index';
export type { ExpansionOptions, ExpansionResult } from './index';
export { expandSingleBeat } from './beat-writer';
export type { BeatExpansionContext, RelevantAssets } from './beat-writer';
export { initializeContinuityState, updateContinuityState, isFactUsed, isCharacterIntroduced, getOpenPromises, getRecentContext, generateStateSummary, validateContinuity } from './continuity-tracker';
export type { ContinuityTracker } from './continuity-tracker';
export { getRelevantAssets, injectAssetConsistency, generateCharacterIntroDescription, generateLocationBrief, generateImagePrompt, validateVisualCallouts } from './consistency-injector';
