/**
 * Content Scoping Module - Main Orchestrator
 * ============================================================================
 * Analyzes content density and determines optimal duration within user's range.
 */

import type { 
  ResearchDossier, 
  DurationDecision, 
  ContentDensityAnalysis,
  DurationRange,
  ScriptGenre,
} from '../types';
import { DEFAULT_CONTENT_ALLOCATION, GENRE_CONFIG } from '../config';
import { analyzeContentDensity } from './density-analyzer';
import { calculateOptimalDuration } from './duration-calculator';

// ============================================================================
// TYPES
// ============================================================================

export interface ScopingResult {
  /** Content density analysis */
  densityAnalysis: ContentDensityAnalysis;
  /** Duration decision with reasoning */
  durationDecision: DurationDecision;
  /** Whether content is too thin for minimum duration */
  contentTooThin: boolean;
  /** Whether content is too rich for maximum duration */
  contentTooRich: boolean;
  /** Recommendations if content doesn't fit range */
  recommendations: string[];
}

export interface ScopingOptions {
  /** Research dossier (if available) */
  dossier: ResearchDossier | null;
  /** User's desired duration range */
  durationRange: DurationRange;
  /** Script genre */
  genre: ScriptGenre;
  /** The topic being covered */
  topic: string;
  /** Any must-include elements (affects minimum content needs) */
  mustInclude?: string[];
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Execute the content scoping phase.
 * 
 * Analyzes available content and determines optimal duration within the user's range.
 * 
 * @param options - Scoping options
 * @returns Scoping result with duration decision
 */
export async function executeScopingPhase(
  options: ScopingOptions
): Promise<ScopingResult> {
  const { dossier, durationRange, genre, topic, mustInclude } = options;

  console.log(`[Scoping] Starting content scoping for "${topic.substring(0, 50)}..."`);
  console.log(`[Scoping] Duration range: ${durationRange.minMinutes}-${durationRange.maxMinutes} minutes`);

  // Step 1: Analyze content density
  const densityAnalysis = analyzeContentDensity(dossier, {
    mustIncludeCount: mustInclude?.length || 0,
  });

  console.log(`[Scoping] Density analysis: ${JSON.stringify(densityAnalysis)}`);

  // Step 2: Calculate optimal duration
  const { decision, contentFit } = calculateOptimalDuration(
    densityAnalysis,
    durationRange,
    genre
  );

  // Step 3: Generate recommendations if content doesn't fit well
  const recommendations = generateRecommendations(contentFit, durationRange, densityAnalysis);

  console.log(`[Scoping] Recommended duration: ${decision.recommendedDurationSeconds}s (${Math.round(decision.recommendedDurationSeconds / 60)} min)`);
  console.log(`[Scoping] Content fit: thin=${contentFit.tooThin}, rich=${contentFit.tooRich}`);

  return {
    densityAnalysis,
    durationDecision: decision,
    contentTooThin: contentFit.tooThin,
    contentTooRich: contentFit.tooRich,
    recommendations,
  };
}

/**
 * Generate recommendations based on content fit
 */
function generateRecommendations(
  contentFit: { tooThin: boolean; tooRich: boolean; idealDurationSeconds: number },
  durationRange: DurationRange,
  densityAnalysis: ContentDensityAnalysis
): string[] {
  const recommendations: string[] = [];

  if (contentFit.tooThin) {
    const idealMinutes = Math.round(contentFit.idealDurationSeconds / 60);
    recommendations.push(
      `Content may be thin for a ${durationRange.minMinutes}-minute video. ` +
      `Consider a ${idealMinutes}-minute format or expanding scope.`
    );

    if (densityAnalysis.factCountScore === 'lean') {
      recommendations.push('Consider adding more research or expanding the topic scope.');
    }

    if (densityAnalysis.characterCount < 3) {
      recommendations.push('Few characters means less narrative complexity - consider focusing on depth over breadth.');
    }
  }

  if (contentFit.tooRich) {
    const idealMinutes = Math.round(contentFit.idealDurationSeconds / 60);
    recommendations.push(
      `Content is very rich - ${idealMinutes}+ minutes recommended. ` +
      `Consider a series or focus on key aspects only.`
    );

    if (densityAnalysis.narrativeComplexity === 'complex') {
      recommendations.push('Multiple narrative threads detected. Consider splitting into parts.');
    }

    if (densityAnalysis.theoryCount > 3) {
      recommendations.push('Many theories/interpretations present. Consider covering main theory and mentioning others briefly.');
    }
  }

  return recommendations;
}

/**
 * Quick scoping without research dossier.
 * Used for fiction or when research is disabled.
 */
export function quickScoping(
  durationRange: DurationRange,
  genre: ScriptGenre,
  estimatedComplexity: 'simple' | 'medium' | 'complex' = 'medium'
): ScopingResult {
  // Create a synthetic density analysis based on complexity
  const densityAnalysis: ContentDensityAnalysis = {
    factCountScore: estimatedComplexity === 'simple' ? 'lean' : 
                    estimatedComplexity === 'medium' ? 'mid' : 'rich',
    narrativeComplexity: estimatedComplexity === 'complex' ? 'complex' : 'single_thread',
    theoryCount: estimatedComplexity === 'complex' ? 3 : 1,
    timelineSpan: 'months',
    characterCount: estimatedComplexity === 'complex' ? 6 : 3,
    visualSceneCount: estimatedComplexity === 'complex' ? 10 : 5,
  };

  const { decision, contentFit } = calculateOptimalDuration(
    densityAnalysis,
    durationRange,
    genre
  );

  return {
    densityAnalysis,
    durationDecision: decision,
    contentTooThin: contentFit.tooThin,
    contentTooRich: contentFit.tooRich,
    recommendations: [],
  };
}
