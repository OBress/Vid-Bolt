// Scoping module exports
export { executeScopingPhase, quickScoping } from './index';
export type { ScopingResult, ScopingOptions } from './index';
export { analyzeContentDensity, calculateContentScore, describeDensity } from './density-analyzer';
export type { DensityAnalysisOptions } from './density-analyzer';
export { calculateOptimalDuration, calculateBeatCount, calculateTimeAllocation, shouldReconsiderRange } from './duration-calculator';
export type { ContentFit } from './duration-calculator';
