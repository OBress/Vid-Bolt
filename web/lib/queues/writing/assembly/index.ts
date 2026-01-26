/**
 * Assembly Module - Main Orchestrator
 * ============================================================================
 * Assembles expanded beats into final script with quality validation.
 */

import type { 
  ExpandedBeat,
  Spine,
  AssetRegistry,
  ResearchDossier,
  DurationDecision,
  UniversalScriptOutput,
  QualityValidation,
  ScriptGenre,
} from '../types';
import { 
  validateQuality, 
  type ValidationOptions,
} from './quality-validator';
import { 
  formatFinalOutput,
  type FormattingOptions,
} from './output-formatter';
import { smoothTransitions as aiSmoothTransitions } from './transition-smoother';

// ============================================================================
// TYPES
// ============================================================================

/** Progress callback for granular UI updates */
export type AssemblyProgressCallback = (
  step: string,
  substepIndex: number,
  totalSubsteps: number
) => Promise<void>;

export interface AssemblyOptions {
  userId: string;
  genre: ScriptGenre;
  expandedBeats: ExpandedBeat[];
  spine: Spine;
  assetRegistry: AssetRegistry;
  dossier: ResearchDossier | null;
  durationDecision: DurationDecision;
  /** Optional callback for reporting progress during assembly */
  onProgress?: AssemblyProgressCallback;
}

export interface AssemblyResult {
  /** Final assembled script */
  finalScript: string;
  /** Quality validation results */
  qualityValidation: QualityValidation;
  /** Complete output structure */
  output: UniversalScriptOutput;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Assemble the final script from expanded beats with quality validation.
 */
export async function assembleScript(
  options: AssemblyOptions
): Promise<AssemblyResult> {
  const { 
    userId, 
    genre, 
    expandedBeats, 
    spine, 
    assetRegistry, 
    dossier,
    durationDecision,
    onProgress,
  } = options;

  const TOTAL_SUBSTEPS = 4;

  console.log(`[Assembly] Starting assembly of ${expandedBeats.length} beats`);

  // Step 1: AI-powered transition smoothing
  console.log('[Assembly] Running AI transition smoother...');
  if (onProgress) {
    await onProgress('Smoothing transitions...', 1, TOTAL_SUBSTEPS);
  }
  const transitionResult = await aiSmoothTransitions(userId, expandedBeats, spine);
  const smoothedBeats = transitionResult.smoothedBeats;
  console.log(`[Assembly] Transitions fixed: ${transitionResult.transitionsFixed}, avg score: ${transitionResult.averageTransitionScore.toFixed(1)}/10`);

  // Step 2: Concatenate smoothed beats into script
  if (onProgress) {
    await onProgress('Assembling script...', 2, TOTAL_SUBSTEPS);
  }
  const rawScript = concatenateBeats(smoothedBeats);
  const smoothedScript = cleanupWhitespace(rawScript);
  console.log(`[Assembly] Final script: ${smoothedScript.length} characters`);

  // Step 3: Validate quality
  console.log('[Assembly] Running quality validation...');
  if (onProgress) {
    await onProgress('Validating quality...', 3, TOTAL_SUBSTEPS);
  }
  const validationOptions: ValidationOptions = {
    userId,
    genre,
    script: smoothedScript,
    expandedBeats,
    spine,
    dossier,
    assetRegistry,
  };
  
  const qualityValidation = await validateQuality(validationOptions);
  console.log(`[Assembly] Quality validation: ${qualityValidation.passed ? 'PASSED' : 'FAILED'}`);

  // Step 4: Format final output
  if (onProgress) {
    await onProgress('Formatting output...', 4, TOTAL_SUBSTEPS);
  }
  const formattingOptions: FormattingOptions = {
    script: smoothedScript,
    expandedBeats,
    spine,
    assetRegistry,
    dossier,
    durationDecision,
    qualityValidation,
  };

  const output = formatFinalOutput(formattingOptions);

  return {
    finalScript: smoothedScript,
    qualityValidation,
    output,
  };
}

// ============================================================================
// ASSEMBLY FUNCTIONS
// ============================================================================

/**
 * Concatenate expanded beats into a single script
 */
function concatenateBeats(beats: ExpandedBeat[]): string {
  return beats
    .map(beat => beat.narration)
    .join('\n\n');
}

/**
 * Clean up whitespace in script
 */
function cleanupWhitespace(script: string): string {
  let cleaned = script;

  // Clean up excessive whitespace (more than 2 newlines -> 2 newlines)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Clean up multiple spaces (but preserve newlines)
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return cleaned.trim();
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Extract just the narration text (no tags)
 */
export function extractCleanNarration(script: string): string {
  return script
    .replace(/\[(CHAR|LOC|OBJ)-\d{3}\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Split script into paragraphs
 */
export function splitIntoParagraphs(script: string): string[] {
  return script.split(/\n\n+/).filter(p => p.trim());
}

/**
 * Estimate reading time in seconds
 */
export function estimateReadingTime(script: string, wpm: number = 150): number {
  const wordCount = script.split(/\s+/).length;
  return Math.round((wordCount / wpm) * 60);
}
