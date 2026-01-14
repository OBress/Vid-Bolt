/**
 * Content Density Analyzer
 * ============================================================================
 * Analyzes the research dossier to determine content density factors.
 */

import type { 
  ResearchDossier, 
  ContentDensityAnalysis,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface DensityAnalysisOptions {
  /** Count of must-include elements */
  mustIncludeCount?: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Analyze content density from research dossier.
 * 
 * @param dossier - Research dossier (or null if no research)
 * @param options - Analysis options
 * @returns Content density analysis
 */
export function analyzeContentDensity(
  dossier: ResearchDossier | null,
  options: DensityAnalysisOptions = {}
): ContentDensityAnalysis {
  // If no dossier, return default medium density
  if (!dossier) {
    return {
      factCountScore: 'mid',
      narrativeComplexity: 'single_thread',
      theoryCount: 0,
      timelineSpan: 'months',
      characterCount: 0,
      visualSceneCount: 5,
    };
  }

  return {
    factCountScore: scoreFactCount(dossier.facts.length),
    narrativeComplexity: assessNarrativeComplexity(dossier),
    theoryCount: dossier.theories.length,
    timelineSpan: assessTimelineSpan(dossier.timeline),
    characterCount: countPeopleEntities(dossier),
    visualSceneCount: estimateVisualScenes(dossier),
  };
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Score the fact count as lean, mid, or rich
 */
function scoreFactCount(count: number): 'lean' | 'mid' | 'rich' {
  if (count < 20) return 'lean';
  if (count < 50) return 'mid';
  return 'rich';
}

/**
 * Assess narrative complexity based on dossier content
 */
function assessNarrativeComplexity(
  dossier: ResearchDossier
): 'single_thread' | 'multiple_threads' | 'complex' {
  const indicators = {
    multipleTheories: dossier.theories.length > 2,
    multipleEntities: dossier.entities.length > 5,
    conflicts: dossier.conflicts.length > 1,
    longTimeline: dossier.timeline.length > 10,
  };

  const complexityScore = Object.values(indicators).filter(Boolean).length;

  if (complexityScore >= 3) return 'complex';
  if (complexityScore >= 1) return 'multiple_threads';
  return 'single_thread';
}

/**
 * Assess timeline span from timeline events
 */
function assessTimelineSpan(
  timeline: ResearchDossier['timeline']
): 'single_event' | 'days' | 'months' | 'years' | 'decades' {
  if (timeline.length === 0) return 'single_event';
  if (timeline.length === 1) return 'single_event';

  // Try to parse dates and calculate span
  const dates = timeline
    .map(e => parseDate(e.date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 2) return 'months';

  const spanMs = dates[dates.length - 1].getTime() - dates[0].getTime();
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  if (spanDays < 7) return 'days';
  if (spanDays < 365) return 'months';
  if (spanDays < 3650) return 'years';
  return 'decades';
}

/**
 * Parse a date string liberally
 */
function parseDate(dateStr: string): Date | null {
  // Try direct parse
  const direct = new Date(dateStr);
  if (!isNaN(direct.getTime())) return direct;

  // Try year-only
  const yearMatch = dateStr.match(/\b(1\d{3}|20\d{2})\b/);
  if (yearMatch) {
    return new Date(`${yearMatch[1]}-01-01`);
  }

  return null;
}

/**
 * Count people entities
 */
function countPeopleEntities(dossier: ResearchDossier): number {
  return dossier.entities.filter(e => e.type === 'person').length;
}

/**
 * Estimate number of distinct visual scenes needed
 */
function estimateVisualScenes(dossier: ResearchDossier): number {
  const locations = dossier.entities.filter(e => e.type === 'location').length;
  const timelineEvents = dossier.timeline.length;
  const people = countPeopleEntities(dossier);

  // Rough estimate: each location + major events + character introductions
  return Math.max(3, locations + Math.ceil(timelineEvents / 3) + Math.ceil(people / 2));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate content score (0-100) from density analysis
 */
export function calculateContentScore(analysis: ContentDensityAnalysis): number {
  let score = 50; // Base score

  // Fact count contribution (up to 25 points)
  if (analysis.factCountScore === 'rich') score += 25;
  else if (analysis.factCountScore === 'mid') score += 15;
  else score += 5;

  // Narrative complexity (up to 15 points)
  if (analysis.narrativeComplexity === 'complex') score += 15;
  else if (analysis.narrativeComplexity === 'multiple_threads') score += 10;
  else score += 5;

  // Theory count (up to 10 points)
  score += Math.min(10, analysis.theoryCount * 3);

  // Character count (up to 10 points - more characters = more content)
  score += Math.min(10, analysis.characterCount * 2);

  return Math.min(100, score);
}

/**
 * Describe density in human-readable terms
 */
export function describeDensity(analysis: ContentDensityAnalysis): string {
  const parts: string[] = [];

  if (analysis.factCountScore === 'lean') {
    parts.push('Limited factual content');
  } else if (analysis.factCountScore === 'rich') {
    parts.push('Rich factual content');
  }

  if (analysis.narrativeComplexity === 'complex') {
    parts.push('complex narrative structure');
  } else if (analysis.narrativeComplexity === 'single_thread') {
    parts.push('straightforward narrative');
  }

  if (analysis.theoryCount > 2) {
    parts.push(`${analysis.theoryCount} theories to cover`);
  }

  if (analysis.characterCount > 5) {
    parts.push(`${analysis.characterCount} key figures`);
  }

  return parts.join(', ') || 'Standard content density';
}
