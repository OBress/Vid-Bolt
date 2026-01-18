/**
 * Worker Index
 * ============================================================================
 * Re-exports all worker processors for the worker bootstrap.
 */

export { writingProcessor } from './writing';
export { universalScriptProcessor } from './universal-script';
export { audioProcessor } from './audio';
export { avScriptProcessor } from './av-script';
export { visualDirectorProcessor } from './visual-director';
export { 
  gpuImageCreateProcessor,
  gpuImageEditProcessor,
  gpuVideoCreateProcessor,
  gpuLtx2CreateProcessor,
  gpuLtx2InterpolateProcessor,
} from './gpu-api-test';
export { gcpProvisionProcessor } from './gcp-provision';
