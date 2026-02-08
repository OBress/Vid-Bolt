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
} from './gpu-api-test';
export { gcpProvisionProcessor } from './gcp-provision';
export { segmentProcessor, createSegmentationWorker } from './segment';
export { stockMediaProcessor } from './stock-media';
export { assetReferenceImageProcessor } from './asset-reference-images';
export { researchCompareProcessor } from './research-compare';
export { gpuShutdownCheckProcessor, checkForInactiveVMs } from './gpu-shutdown-checker';
