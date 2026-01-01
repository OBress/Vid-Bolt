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

// ============================================================================
// TYPES
// ============================================================================

export interface AssemblyOptions {
  userId: string;
  genre: ScriptGenre;
  expandedBeats: ExpandedBeat[];
  spine: Spine;
  assetRegistry: AssetRegistry;
  dossier: ResearchDossier | null;
  durationDecision: DurationDecision;
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
  } = options;

  console.log(`[Assembly] Starting assembly of ${expandedBeats.length} beats`);

  // Step 1: Concatenate beats into raw script
  const rawScript = concatenateBeats(expandedBeats);
  console.log(`[Assembly] Raw script: ${rawScript.length} characters`);

  // Step 2: Smooth transitions between beats
  const smoothedScript = smoothTransitions(rawScript, expandedBeats);

  // Step 3: Validate quality
  console.log('[Assembly] Running quality validation...');
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
 * Smooth transitions between beats
 */
function smoothTransitions(rawScript: string, beats: ExpandedBeat[]): string {
  let script = rawScript;

  // Clean up excessive whitespace (more than 2 newlines -> 2 newlines)
  script = script.replace(/\n{3,}/g, '\n\n');
  
  // Clean up multiple spaces (but preserve newlines)
  script = script.replace(/[ \t]{2,}/g, ' ');

  return script.trim();
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
