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
  ScriptStyleConfig,
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
  styleConfig?: ScriptStyleConfig;
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
  const { genre, script, expandedBeats, spine, dossier, assetRegistry, styleConfig } = options;

  // Run validations in parallel
  const [
    factualResult,
    consistencyResult,
    engagementResult, 
    completenessResult,
    antiFillerResult,
    visualAnimatabilityResult,
  ] = await Promise.all([
    dossier ? validateFactualAccuracy(script, dossier) : Promise.resolve({ passed: true, issues: [] }),
    validateConsistency(script, assetRegistry, expandedBeats),
    validateEngagement(script, spine, expandedBeats),
    validateCompleteness(expandedBeats, spine, dossier),
    validateAntiFiller(script, genre, styleConfig),
    Promise.resolve(validateVisualAnimatability(script)),
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
    visualAnimatability: visualAnimatabilityResult,
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
  genre: ScriptGenre,
  styleConfig?: ScriptStyleConfig
): Promise<{ passed: boolean; flaggedSections: string[] }> {
  const flaggedSections: string[] = [];

  // Check for banned phrases
  const bannedPhrases = [
    ...(BANNED_PHRASES[genre] || []),
    ...(styleConfig?.customBannedPhrases || []),
  ];
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

// ============================================================================
// VISUAL ANIMATABILITY (Dead Zone Detection)
// ============================================================================

/**
 * Concrete/sensory word lists for visual animatability detection.
 * Sentences containing these are considered "visualizable."
 */
const SENSORY_VERBS = new Set([
  'walk', 'walks', 'walked', 'walking',
  'run', 'runs', 'ran', 'running',
  'stand', 'stands', 'stood', 'standing',
  'sit', 'sits', 'sat', 'sitting',
  'look', 'looks', 'looked', 'looking',
  'watch', 'watches', 'watched', 'watching',
  'hold', 'holds', 'held', 'holding',
  'open', 'opens', 'opened', 'opening',
  'close', 'closes', 'closed', 'closing',
  'drive', 'drives', 'drove', 'driving',
  'fly', 'flies', 'flew', 'flying',
  'build', 'builds', 'built', 'building',
  'break', 'breaks', 'broke', 'breaking',
  'fall', 'falls', 'fell', 'falling',
  'rise', 'rises', 'rose', 'rising',
  'crash', 'crashes', 'crashed', 'crashing',
  'point', 'points', 'pointed', 'pointing',
  'grab', 'grabs', 'grabbed', 'grabbing',
  'push', 'pushes', 'pushed', 'pushing',
  'pull', 'pulls', 'pulled', 'pulling',
  'throw', 'throws', 'threw', 'throwing',
  'catch', 'catches', 'caught', 'catching',
  'wear', 'wears', 'wore', 'wearing',
  'show', 'shows', 'showed', 'showing',
  'sign', 'signs', 'signed', 'signing',
  'write', 'writes', 'wrote', 'writing',
  'read', 'reads', 'reading',
  'see', 'sees', 'saw', 'seeing',
  'hear', 'hears', 'heard', 'hearing',
  'touch', 'touches', 'touched', 'touching',
  'burn', 'burns', 'burned', 'burning',
  'glow', 'glows', 'glowed', 'glowing',
  'shine', 'shines', 'shone', 'shining',
  'flash', 'flashes', 'flashed', 'flashing',
]);

const CONCRETE_NOUN_INDICATORS = new Set([
  'building', 'house', 'office', 'room', 'car', 'street', 'road', 'door',
  'window', 'wall', 'floor', 'desk', 'table', 'chair', 'phone', 'screen',
  'camera', 'crowd', 'city', 'town', 'courtroom', 'prison', 'hospital',
  'school', 'church', 'bridge', 'river', 'mountain', 'forest', 'ocean',
  'face', 'hand', 'hands', 'eyes', 'body', 'blood', 'gun', 'knife',
  'money', 'cash', 'document', 'paper', 'letter', 'photo', 'photograph',
  'video', 'uniform', 'suit', 'badge', 'flag', 'sign', 'stage', 'podium',
]);

/**
 * Check if a sentence contains enough concrete visual anchors.
 * Returns true if the sentence is "visualizable" — it contains
 * proper nouns, sensory verbs, concrete nouns, numbers, or quotations.
 */
function isSentenceVisualizable(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 15) return true; // Very short sentences get a pass
  
  const words = trimmed.split(/\s+/);
  
  // Check for proper nouns (capitalized words not at sentence start)
  const hasProperNoun = words.slice(1).some(w => /^[A-Z][a-z]/.test(w));
  if (hasProperNoun) return true;
  
  // Check for quoted text (implies dialogue/source — always visual)
  if (/"[^"]{3,}"/.test(trimmed)) return true;
  
  // Check for numbers/statistics (data is visualizable via MG)
  if (/\d{2,}/.test(trimmed) || /\$[\d,]+/.test(trimmed) || /\d+%/.test(trimmed)) return true;
  
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
  
  // Check for sensory verbs
  if (lowerWords.some(w => SENSORY_VERBS.has(w))) return true;
  
  // Check for concrete nouns
  if (lowerWords.some(w => CONCRETE_NOUN_INDICATORS.has(w))) return true;
  
  return false;
}

/**
 * Validate visual animatability — detect "visual dead zones."
 * Flags consecutive sentence clusters (3+) where a visual director
 * would struggle to find something to show on screen.
 * 
 * This is a deterministic scan — no LLM call needed.
 */
function validateVisualAnimatability(
  script: string
): { passed: boolean; deadZones: Array<{ sentenceIndex: number; sentenceCount: number; preview: string }> } {
  const sentences = script.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const deadZones: Array<{ sentenceIndex: number; sentenceCount: number; preview: string }> = [];
  
  let abstractRunStart = -1;
  let abstractRunCount = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    if (!isSentenceVisualizable(sentences[i])) {
      if (abstractRunStart === -1) {
        abstractRunStart = i;
        abstractRunCount = 1;
      } else {
        abstractRunCount++;
      }
    } else {
      // End of abstract run — check if it was long enough to flag
      if (abstractRunCount >= 3) {
        const preview = sentences
          .slice(abstractRunStart, abstractRunStart + Math.min(abstractRunCount, 3))
          .join(' ')
          .substring(0, 150) + '...';
        deadZones.push({
          sentenceIndex: abstractRunStart,
          sentenceCount: abstractRunCount,
          preview,
        });
      }
      abstractRunStart = -1;
      abstractRunCount = 0;
    }
  }
  
  // Handle trailing abstract run
  if (abstractRunCount >= 3) {
    const preview = sentences
      .slice(abstractRunStart, abstractRunStart + Math.min(abstractRunCount, 3))
      .join(' ')
      .substring(0, 150) + '...';
    deadZones.push({
      sentenceIndex: abstractRunStart,
      sentenceCount: abstractRunCount,
      preview,
    });
  }
  
  if (deadZones.length > 0) {
    console.log(`[QualityValidator] Found ${deadZones.length} visual dead zone(s) in script`);
    for (const dz of deadZones) {
      console.log(`  → Sentences ${dz.sentenceIndex + 1}-${dz.sentenceIndex + dz.sentenceCount}: "${dz.preview}"`);
    }
  }
  
  return {
    passed: deadZones.length === 0,
    deadZones,
  };
}
