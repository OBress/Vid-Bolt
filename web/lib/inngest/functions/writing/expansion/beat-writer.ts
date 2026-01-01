/**
 * Beat Writer
 * ============================================================================
 * Expands individual beats into full narration scripts.
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
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { countWords } from '../utils';
import { WORDS_PER_MINUTE } from '../config';

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
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Expand a single beat into full narration
 */
export async function expandSingleBeat(
  context: BeatExpansionContext
): Promise<ExpandedBeat> {
  const { beat, beatIndex, totalBeats, dossier, bannedPhrases, genre } = context;

  // Calculate target word count for this beat
  const beatDurationSeconds = beat.timing.durationSeconds;
  const targetWords = Math.round((beatDurationSeconds / 60) * WORDS_PER_MINUTE);

  // Build the prompt with all context
  const prompt = buildBeatExpansionPrompt(context, targetWords);

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

  const narration = response.content.trim();
  const wordCount = countWords(narration);

  // Extract visual callouts from narration (looking for [CHAR-001] style tags)
  const visualCallouts = extractVisualCallouts(narration, context.relevantAssets);

  // Build expanded beat
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
 * Build the complete prompt for beat expansion
 */
function buildBeatExpansionPrompt(
  context: BeatExpansionContext,
  targetWords: number
): string {
  const { beat, previousBeatEnding, continuityState, relevantAssets, dossier, bannedPhrases, genre } = context;

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

BANNED PHRASES (do not use):
${bannedPhrases.slice(0, 10).join(', ')}

Target approximately ${targetWords} words. Write compelling, natural narration.
Include [ASSET-ID] tags (e.g., [CHAR-001], [LOC-001]) where visuals should change.`;
}

/**
 * Extract visual callouts from narration text
 */
function extractVisualCallouts(
  narration: string,
  assets: RelevantAssets
): ExpandedBeat['visualCallouts'] {
  const callouts: ExpandedBeat['visualCallouts'] = [];
  
  // Find all asset ID references in the text
  const idPattern = /\[(CHAR|LOC|OBJ)-\d{3}\]/g;
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
