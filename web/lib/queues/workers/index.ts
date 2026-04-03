/**
 * Worker Index
 * ============================================================================
 * Re-exports all worker processors for the worker bootstrap.
 */

export { writingProcessor } from './writing';
export { universalScriptProcessor } from './universal-script';
export { outlineProcessor } from './outline';
export { scriptWritingProcessor } from './script-writing';
export { audioProcessor } from './audio';
export { avScriptProcessor, avScriptPart2Processor } from './av-script';
export { visualDirectorProcessor } from './visual-director';
export { 
  gpuImageCreateProcessor,
  gpuImageEditProcessor,
  gpuVideoCreateProcessor,
  gpuLtx2CreateProcessor,
  gpuLtx2InterpolateProcessor,
  gpuMusicCreateProcessor,
  gpuSfxCreateProcessor,
  gpuSegmentImageProcessor,
  gpuSegmentVideoProcessor,
  gpuSegmentAnimateProcessor,
} from './gpu-api-test';
export { gcpProvisionProcessor } from './gcp-provision';
export { segmentProcessor, createSegmentationWorker } from './segment';
export { stockMediaProcessor } from './stock-media';
export { assetReferenceImageProcessor } from './asset-reference-images';
export { researchCompareProcessor } from './research-compare';
export { gpuShutdownCheckProcessor, checkForInactiveVMs } from './gpu-shutdown-checker';
export { videoRenderProcessor } from './render';
export { editAssemblyProcessor } from './edit-assembly';
export { mediaNormalizationProcessor } from './media-normalization';
export { orchestratorProcessor } from './orchestrator';
export { shotPlannerProcessor } from './shot-planner';
export { assetScoutProcessor } from './asset-scout';
export { imageGenProcessor } from './image-gen';
export { videoGenProcessor } from './video-gen';
export { verifierProcessor } from './verifier';
export { imageEditProcessor } from './image-edit';
export { dataRetentionCleanupProcessor } from './data-retention-cleanup';
export {
  channelStatsSyncProcessor,
  dailySnapshotSyncProcessor,
  videoAnalyticsSyncProcessor,
  demographicsSyncProcessor,
  competitorSyncProcessor,
  platformDailyAggregateProcessor,
} from './analytics-sync';
export { nicheDiscoveryProcessor } from './niche-discovery';
