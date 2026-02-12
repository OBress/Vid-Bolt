/**
 * Quality Validator
 * ============================================================================
 * Validates script quality across factual accuracy, consistency, and engagement.
 */

import type { 
  QualityValidation, 
  ExpandedBeat,
  Spine,
  ResearchDossier,
  AssetRegistry,
  ScriptGenre,
} from '../types';
import { BANNED_PHRASES } from '../config';
import { findBannedPhrases } from '../utils';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationOptions {
  userId: string;
  genre: ScriptGenre;
  script: string;
  expandedBeats: ExpandedBeat[];
  spine: Spine;
  dossier: ResearchDossier | null;
  assetRegistry: AssetRegistry;
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

/**
 * Run all quality validation checks
 */
export async function validateQuality(
  options: ValidationOptions
): Promise<QualityValidation> {
  const { genre, script, expandedBeats, spine, dossier, assetRegistry } = options;

  // Run validations in parallel
  const [
    factualResult,
    consistencyResult,
    engagementResult, 
    completenessResult,
    antiFillerResult,
  ] = await Promise.all([
    dossier ? validateFactualAccuracy(script, dossier) : Promise.resolve({ passed: true, issues: [] }),
    validateConsistency(script, assetRegistry, expandedBeats),
    validateEngagement(script, spine, expandedBeats),
    validateCompleteness(expandedBeats, spine, dossier),
    validateAntiFiller(script, genre),
  ]);

  // Overall pass if all critical checks pass
  const passed = 
    factualResult.passed && 
    consistencyResult.passed && 
    engagementResult.passed;

  return {
    passed,
    factualAccuracy: factualResult,
    consistency: consistencyResult,
    engagement: engagementResult,
    completeness: completenessResult,
    antiFillerCheck: antiFillerResult,
  };
}

// ============================================================================
// FACTUAL ACCURACY
// ============================================================================

/**
 * Validate factual accuracy against research dossier
 */
async function validateFactualAccuracy(
  script: string,
  dossier: ResearchDossier
): Promise<{ passed: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check that facts used are from the dossier
  const usedFactIds = new Set<string>();
  
  for (const fact of dossier.facts) {
    // Check if fact statement appears in script (loosely)
    const factWords = fact.statement.toLowerCase().split(/\s+/).slice(0, 5);
    const scriptLower = script.toLowerCase();
    
    if (factWords.some(word => word.length > 4 && scriptLower.includes(word))) {
      usedFactIds.add(fact.id);
    }
  }

  // Check for low confidence facts being stated as certain
  for (const factId of usedFactIds) {
    const fact = dossier.facts.find(f => f.id === factId);
    if (fact && (fact.confidence === 'low' || fact.confidence === 'unverified')) {
      issues.push(`Low confidence fact potentially stated as certain: ${fact.id}`);
    }
  }

  // Check that quotes are properly attributed
  for (const quote of dossier.quotes) {
    const quoteLower = quote.quote.substring(0, 50).toLowerCase();
    if (script.toLowerCase().includes(quoteLower)) {
      // Check if speaker is mentioned nearby
      if (!script.toLowerCase().includes(quote.speaker.toLowerCase())) {
        issues.push(`Quote may be missing attribution: "${quote.quote.substring(0, 30)}..."`);
      }
    }
  }

  return {
    passed: issues.length <= 2, // Allow a couple minor issues
    issues,
  };
}

// ============================================================================
// CONSISTENCY
// ============================================================================

/**
 * Validate internal consistency
 */
async function validateConsistency(
  script: string,
  assetRegistry: AssetRegistry,
  beats: ExpandedBeat[]
): Promise<{ passed: boolean; issues: string[] }> {
  const issues: string[] = [];
  const scriptLower = script.toLowerCase();

  // Check name consistency - look for similar names that might be typos
  const mentionedNames = new Set<string>();
  for (const char of assetRegistry.characters) {
    if (scriptLower.includes(char.name.toLowerCase())) {
      mentionedNames.add(char.name);
    }
  }

  // Check all beats have content
  for (let i = 0; i < beats.length; i++) {
    if (beats[i].wordCount < 10) {
      issues.push(`Beat ${i + 1} has very little content (${beats[i].wordCount} words)`);
    }
  }

  // Check for contradictory statements (basic heuristic)
  const contradictionPatterns = [
    { positive: 'never', negative: 'always' },
    { positive: 'first', negative: 'last' },
    { positive: 'largest', negative: 'smallest' },
  ];

  for (const pattern of contradictionPatterns) {
    if (scriptLower.includes(pattern.positive) && scriptLower.includes(pattern.negative)) {
      // This is very rough - just flag for review
      issues.push(`Potential contradiction: script contains both "${pattern.positive}" and "${pattern.negative}"`);
    }
  }

  return {
    passed: issues.length <= 1,
    issues,
  };
}

// ============================================================================
// ENGAGEMENT
// ============================================================================

/**
 * Validate engagement quality
 */
async function validateEngagement(
  script: string,
  spine: Spine,
  beats: ExpandedBeat[]
): Promise<{ passed: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check for hook in opening
  const firstBeat = beats[0];
  if (firstBeat && firstBeat.wordCount < 20) {
    issues.push('Opening beat may be too short for effective hook');
  }

  // Check for unclosed loops
  const unclosedLoops = spine.openLoops.filter(l => l.closedAtBeatIndex === undefined);
  if (unclosedLoops.length > 0) {
    issues.push(`${unclosedLoops.length} open loops never closed`);
  }

  // Check energy variety
  let consecutiveSameEnergy = 0;
  let lastEnergy = '';
  
  for (const beat of spine.beats) {
    if (beat.toneEnergy.energyRelativeToPrevious === 'same' && lastEnergy === 'same') {
      consecutiveSameEnergy++;
    } else {
      consecutiveSameEnergy = 0;
    }
    lastEnergy = beat.toneEnergy.energyRelativeToPrevious;
    
    if (consecutiveSameEnergy > 3) {
      issues.push('Multiple consecutive beats with same energy level');
      break;
    }
  }

  return {
    passed: issues.length <= 1,
    issues,
  };
}

// ============================================================================
// COMPLETENESS
// ============================================================================

/**
 * Validate completeness of coverage
 */
async function validateCompleteness(
  beats: ExpandedBeat[],
  spine: Spine,
  dossier: ResearchDossier | null
): Promise<{ passed: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check all spine beats have expanded content
  if (beats.length !== spine.beatCount) {
    issues.push(`Beat count mismatch: ${beats.length} expanded vs ${spine.beatCount} in spine`);
  }

  // Check fact utilization if dossier exists
  if (dossier && dossier.facts.length > 0) {
    const usedFactIds = new Set(beats.flatMap(b => b.factsUsed));
    const utilization = usedFactIds.size / dossier.facts.length;
    
    if (utilization < 0.3 && dossier.facts.length > 10) {
      issues.push(`Low fact utilization: only ${Math.round(utilization * 100)}% of researched facts used`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ============================================================================
// ANTI-FILLER
// ============================================================================

/**
 * Check for filler content
 */
async function validateAntiFiller(
  script: string,
  genre: ScriptGenre
): Promise<{ passed: boolean; flaggedSections: string[] }> {
  const flaggedSections: string[] = [];

  // Check for banned phrases
  const bannedPhrases = BANNED_PHRASES[genre];
  const foundBanned = findBannedPhrases(script, bannedPhrases);
  
  for (const phrase of foundBanned) {
    flaggedSections.push(`Banned phrase found: "${phrase}"`);
  }

  // Check for meta-commentary
  const metaPhrases = [
    'in this video',
    'we will discuss',
    'let me tell you',
    'as I mentioned',
    'as we discussed',
    'in conclusion',
  ];

  for (const phrase of metaPhrases) {
    if (script.toLowerCase().includes(phrase)) {
      flaggedSections.push(`Meta-commentary: "${phrase}"`);
    }
  }

  // Check for excessive hedging
  const hedgingPhrases = ['perhaps', 'maybe', 'possibly', 'might be', 'could be'];
  let hedgeCount = 0;
  for (const phrase of hedgingPhrases) {
    const regex = new RegExp(phrase, 'gi');
    const matches = script.match(regex);
    hedgeCount += matches?.length || 0;
  }

  if (hedgeCount > 5) {
    flaggedSections.push(`Excessive hedging: ${hedgeCount} hedging phrases`);
  }

  return {
    passed: flaggedSections.length <= 3,
    flaggedSections,
  };
}
