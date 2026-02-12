/**
 * Beat Writer
 * ============================================================================
 * Expands individual beats into full narration scripts with quality assurance.
 */

import { generateText } from '@/lib/ai/openrouter';
import type { 
  Beat, 
  ExpandedBeat,
  ContinuityState,
  ResearchDossier,
  ScriptGenre,
  CharacterProfile,
  LocationProfile,
  ObjectProfile,
  Spine,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { countWords } from '../utils';
import { WORDS_PER_MINUTE } from '../config';
import { buildWritingContext, formatContextForPrompt, type WritingContext } from './context-builder';
import { 
  reviewBeatQuality, 
  rewriteBeat, 
  MAX_REWRITE_ATTEMPTS,
  type BeatReviewContext,
} from './quality-reviewer';

// ============================================================================
// TYPES
// ============================================================================

export interface RelevantAssets {
  characters: CharacterProfile[];
  locations: LocationProfile[];
  objects: ObjectProfile[];
}

export interface BeatExpansionContext {
  userId: string;
  beat: Beat;
  beatIndex: number;
  totalBeats: number;
  previousBeatEnding: string;
  continuityState: ContinuityState;
  relevantAssets: RelevantAssets;
  dossier: ResearchDossier | null;
  bannedPhrases: string[];
  genre: ScriptGenre;
  /** Full spine for video skeleton context */
  spine: Spine;
  /** All previously expanded beats for continuity */
  allPreviousBeats: ExpandedBeat[];
  /** Enable quality review loop (default: true) */
  enableQualityReview?: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Expand a single beat into full narration with quality review
 */
export async function expandSingleBeat(
  context: BeatExpansionContext
): Promise<ExpandedBeat> {
  const { beat, beatIndex, totalBeats, dossier: _dossier, bannedPhrases: _bannedPhrases, genre, spine, allPreviousBeats, userId, continuityState } = context;
  const enableQualityReview = context.enableQualityReview !== false;

  // Use dynamic targetWords from spine if available, otherwise calculate from duration
  const beatDurationSeconds = beat.timing.durationSeconds;
  const targetWords = (beat as any).targetWords 
    || Math.round((beatDurationSeconds / 60) * WORDS_PER_MINUTE);

  // Build rich writing context
  const writingContext = buildWritingContext(
    spine,
    beatIndex,
    allPreviousBeats,
    continuityState
  );

  // Build the prompt with enhanced context
  const prompt = buildEnhancedBeatPrompt(context, targetWords, writingContext);

  // Generate the narration
  const response = await generateText(
    context.userId,
    UNIVERSAL_PROMPTS.beatExpansion
      .replace('{beatIndex}', String(beatIndex + 1))
      .replace('{totalBeats}', String(totalBeats))
      .replace('{startSeconds}', String(beat.timing.startSeconds))
      .replace('{endSeconds}', String(beat.timing.endSeconds))
      .replace('{durationSeconds}', String(beatDurationSeconds))
      .replace('{targetWords}', String(targetWords)),
    prompt
  );

  let narration = response.content.trim();
  let wordCount = countWords(narration);

  // Extract visual callouts from narration (looking for [CHAR-001] style tags)
  let visualCallouts = extractVisualCallouts(narration, context.relevantAssets);

  // Remove asset tags from the narration text for the user-facing script
  // We keep the callouts we just extracted, but remove the inline tags
  // Also remove [ASSET-###] tags as the AI sometimes generates these literally
  narration = narration.replace(/\[(CHAR|LOC|OBJ|ASSET)-\d{3}\]/g, '');


  // Quality review loop (if enabled)
  if (enableQualityReview) {
    const previousBeatsContext = allPreviousBeats
      .slice(-3)
      .map(b => b.narration.substring(0, 300))
      .join('\n---\n');

    const reviewContext: BeatReviewContext = {
      userId,
      beatNarration: narration,
      beatIndex,
      previousBeatsContext,
      continuityState,
      genre,
    };

    let reviewResult = await reviewBeatQuality(reviewContext);
    let rewriteAttempts = 0;
    let finalScore = reviewResult.score;

    while (!reviewResult.passed && rewriteAttempts < MAX_REWRITE_ATTEMPTS) {
      console.log(`[BeatWriter] Beat ${beatIndex + 1} requires rewrite (score: ${reviewResult.score}/10, attempt ${rewriteAttempts + 1})`);
      
      narration = await rewriteBeat(
        userId,
        narration,
        reviewResult,
        previousBeatsContext,
        continuityState
      );
      
      wordCount = countWords(narration);
      visualCallouts = extractVisualCallouts(narration, context.relevantAssets);
      
      // Remove asset tags from the rewritten narration (including [ASSET-###] tags)
      narration = narration.replace(/\[(CHAR|LOC|OBJ|ASSET)-\d{3}\]/g, '');

      // Re-review the rewritten beat
      reviewContext.beatNarration = narration;
      reviewResult = await reviewBeatQuality(reviewContext);
      finalScore = reviewResult.score;
      rewriteAttempts++;
    }

    if (reviewResult.passed) {
      console.log(`[BeatWriter] Beat ${beatIndex + 1} PASSED quality review (score: ${reviewResult.score}/10)`);
    } else {
      console.log(`[BeatWriter] Beat ${beatIndex + 1} proceeding after ${rewriteAttempts} rewrites (final score: ${reviewResult.score}/10)`);
    }

    // Build expanded beat with quality score
    return {
      beatIndex,
      narration,
      visualCallouts,
      audioNotes: {
        musicMood: beat.toneEnergy.mood,
        ambientSounds: inferAmbientSounds(context.relevantAssets),
      },
      pacingNotes: {
        emphases: beat.keyPoints.slice(0, 3),
      },
      wordCount,
      factsUsed: beat.researchReferences.factIds,
      qualityScore: finalScore,
    };
  }

  // Build expanded beat without quality review (no score)
  return {
    beatIndex,
    narration,
    visualCallouts,
    audioNotes: {
      musicMood: beat.toneEnergy.mood,
      ambientSounds: inferAmbientSounds(context.relevantAssets),
    },
    pacingNotes: {
      emphases: beat.keyPoints.slice(0, 3),
    },
    wordCount,
    factsUsed: beat.researchReferences.factIds,
  };
}

/**
 * Build the enhanced prompt for beat expansion with full context
 */
function buildEnhancedBeatPrompt(
  context: BeatExpansionContext,
  targetWords: number,
  writingContext: WritingContext
): string {
  const { beat, previousBeatEnding, continuityState, relevantAssets, dossier, bannedPhrases } = context;

  // Build research references section
  let researchSection = '';
  if (dossier && beat.researchReferences.factIds.length > 0) {
    const facts = beat.researchReferences.factIds
      .map(id => dossier.facts.find(f => f.id === id))
      .filter(Boolean)
      .map(f => `- [${f!.id}] ${f!.statement} (${f!.confidence})`)
      .join('\n');
    researchSection = `RESEARCH REFERENCES TO USE:\n${facts}`;
  }

  // Build quote references
  let quoteSection = '';
  if (dossier && beat.researchReferences.quoteIds.length > 0) {
    const quotes = beat.researchReferences.quoteIds
      .map(id => dossier.quotes.find(q => q.id === id))
      .filter(Boolean)
      .map(q => `- [${q!.id}] "${q!.quote}" - ${q!.speaker}`)
      .join('\n');
    quoteSection = `\nQUOTES TO POTENTIALLY USE:\n${quotes}`;
  }

  // Build character descriptions
  const characterSection = relevantAssets.characters.length > 0
    ? `CHARACTERS IN THIS BEAT:\n${relevantAssets.characters.map(c => 
        `- [${c.id}] ${c.name}: ${c.role}`
      ).join('\n')}`
    : '';

  // Build location descriptions  
  const locationSection = relevantAssets.locations.length > 0
    ? `LOCATIONS IN THIS BEAT:\n${relevantAssets.locations.map(l =>
        `- [${l.id}] ${l.name}: ${l.essence}`
      ).join('\n')}`
    : '';

  // Build engagement instructions
  let engagementInstructions = `This beat should: ${beat.classification.engagementFunction}`;
  if (beat.engagement.opensLoop) {
    engagementInstructions += `\nOPEN A CURIOSITY LOOP: Raise a question that keeps viewers watching. Loop ID: ${beat.engagement.loopId}`;
  }
  if (beat.engagement.closesLoop) {
    engagementInstructions += `\nCLOSE A LOOP: Answer a previously raised question. Loop ID: ${beat.engagement.loopId}`;
  }
  if (beat.engagement.isPatternInterrupt) {
    engagementInstructions += '\nPATTERN INTERRUPT: Change tone/energy to re-engage viewers.';
  }

  return `Write narration for this beat.

BEAT SPECIFICATION:
${beat.contentSummary}

KEY POINTS TO COVER:
${beat.keyPoints.map(p => `- ${p}`).join('\n')}

${researchSection}
${quoteSection}

TONE/ENERGY: ${beat.toneEnergy.mood}, ${beat.toneEnergy.pacing} pacing, energy ${beat.toneEnergy.energyRelativeToPrevious} than previous

PREVIOUS CONTEXT:
${previousBeatEnding || 'This is the opening beat.'}

STORY SO FAR:
${continuityState.storySummary}
Established facts: ${continuityState.establishedFacts.slice(0, 5).join(', ')}

${characterSection}

${locationSection}

ENGAGEMENT FUNCTION:
${engagementInstructions}

TRANSITIONS:
From previous: ${beat.transitions.fromPrevious}
To next: ${beat.transitions.toNext}

=== FORBIDDEN WORDS - SUBSTITUTE THESE ===
NEVER use these words. Use the alternatives instead:
- delve/delving → explore, examine, investigate, dig into
- embark → start, begin, set out, kick off
- landscape (figurative) → situation, environment, field
- tapestry → mix, blend, combination
- intricate → complex, detailed, elaborate
- nestled → located, situated, tucked
- realm → area, field, domain, world
- plethora/myriad → many, numerous, lots of
- pivotal → key, crucial, critical
- testament → proof, evidence, indicator
- unprecedented → rare, unusual, first-ever
- seamlessly → smoothly, naturally, easily

=== BANNED PHRASES ===
${bannedPhrases.slice(0, 10).join(', ')}

=== AVOID REPETITION ===
DO NOT use these phrases (already used in previous beats):
${continuityState.usedPhrases?.slice(0, 15).join(', ') || 'None yet'}

=== TTS PHONETIC NORMALIZATION ===
Write for text-to-speech output:
- Spell out numbers: "fifteen million" not "15 million"
- Spell out dates: "January fifteenth, nineteen ninety-nine" not "January 15, 1999"
- Clarify homographs: use "red" for past-tense read, "led" for the metal lead
- Avoid abbreviations: "doctor" not "Dr.", "versus" not "vs."

${formatContextForPrompt(writingContext)}

=== CRITICAL REQUIREMENTS (read last - these are most important) ===
Target: ~${targetWords} words exactly.
1. Make the transition from previous beat feel SEAMLESS and natural
2. Use ZERO forbidden words - substitute with alternatives
3. Vary sentence openers - no two consecutive sentences start the same way
4. Write for the EAR - this will be spoken aloud
5. Use contractions naturally (don't, can't, it's, that's)
6. Be SPECIFIC with details, not vague or generalized`;
}

/**
 * Extract visual callouts from narration text
 */
function extractVisualCallouts(
  narration: string,
  assets: RelevantAssets
): ExpandedBeat['visualCallouts'] {
  const callouts: ExpandedBeat['visualCallouts'] = [];
  
  // Find all asset ID references in the text (including [ASSET-###] style tags)
  const idPattern = /\[(CHAR|LOC|OBJ|ASSET)-\d{3}\]/g;
  const matches = narration.matchAll(idPattern);

  for (const match of matches) {
    const assetId = match[0].slice(1, -1); // Remove brackets
    const context = extractContextAroundMatch(narration, match.index!, 50);
    
    callouts.push({
      assetId,
      context,
    });
  }

  // Also add assets that are mentioned by name but not tagged
  for (const char of assets.characters) {
    if (narration.toLowerCase().includes(char.name.toLowerCase())) {
      if (!callouts.some(c => c.assetId === char.id)) {
        callouts.push({
          assetId: char.id,
          context: `${char.name} mentioned`,
        });
      }
    }
  }

  return callouts;
}

/**
 * Extract context around a match in text
 */
function extractContextAroundMatch(text: string, matchIndex: number, contextLength: number): string {
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + contextLength);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Infer ambient sounds from location assets
 */
function inferAmbientSounds(assets: RelevantAssets): string | undefined {
  if (assets.locations.length === 0) return undefined;
  
  const sounds = assets.locations
    .map(l => l.ambientDetails?.soundsImplied)
    .filter(Boolean);
  
  return sounds.length > 0 ? sounds.join(', ') : undefined;
}
