/**
 * Spine Generation Module - Main Orchestrator
 * ============================================================================
 * Generates the beat-by-beat structural backbone for the video.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  Spine, 
  Beat,
  BeatType,
  ResearchDossier, 
  DurationDecision,
  ScriptGenre,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { getGenreTemplate, type GenreTemplate } from './genre-templates';
import { 
  validateEngagementMechanics, 
  assignEngagementAnchors,
  type EngagementValidation,
} from './engagement-mechanics';
import { createBeatFromSpec, type BeatSpec } from './beat-types';

// ============================================================================
// TYPES
// ============================================================================

export interface SpineGenerationOptions {
  userId: string;
  topic: string;
  genre: ScriptGenre;
  durationDecision: DurationDecision;
  dossier: ResearchDossier | null;
  angle?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
  openrouterModel?: string;
}

export interface SpineGenerationResult {
  spine: Spine;
  engagementValidation: EngagementValidation;
  warnings: string[];
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Generate the complete spine (beat-by-beat structure) for the video.
 */
export async function generateSpine(
  options: SpineGenerationOptions
): Promise<SpineGenerationResult> {
  const { 
    userId, 
    topic, 
    genre, 
    durationDecision, 
    dossier, 
    angle,
    mustInclude,
    mustAvoid,
  } = options;

  console.log(`[Spine] Generating spine for ${durationDecision.beatCount} beats`);

  // Get genre-specific template
  const genreTemplate = getGenreTemplate(genre);
  
  // Step 1: Generate initial beat specifications
  const beatSpecs = await generateBeatSpecs(
    userId,
    topic,
    genre,
    durationDecision,
    dossier,
    genreTemplate,
    { angle, mustInclude, mustAvoid, openrouterModel: options.openrouterModel }
  );

  console.log(`[Spine] Generated ${beatSpecs.length} beat specifications`);

  // Step 2: Assign engagement anchors (hooks, interrupts, climax)
  const beatsWithEngagement = assignEngagementAnchors(
    beatSpecs,
    durationDecision.recommendedDurationSeconds
  );

  // Step 3: Convert to full Beat objects with timing
  const beats = createBeatsWithTiming(beatsWithEngagement, durationDecision);

  // Step 4: Build sections
  const sections = buildSections(beats, genreTemplate);

  // Step 5: Validate engagement mechanics
  const engagementValidation = validateEngagementMechanics(
    beats,
    durationDecision.recommendedDurationSeconds
  );

  // Collect warnings
  const warnings = collectWarnings(engagementValidation, beatSpecs.length, durationDecision.beatCount);

  // Build final spine
  const spine: Spine = {
    beatCount: beats.length,
    totalDurationSeconds: durationDecision.recommendedDurationSeconds,
    sections,
    beats,
    openLoops: extractOpenLoops(beats),
  };

  console.log(`[Spine] Spine complete: ${spine.beatCount} beats, ${spine.sections.length} sections`);

  return {
    spine,
    engagementValidation,
    warnings,
  };
}

// ============================================================================
// BEAT GENERATION
// ============================================================================

/**
 * Generate beat specifications using AI
 */
async function generateBeatSpecs(
  userId: string,
  topic: string,
  genre: ScriptGenre,
  durationDecision: DurationDecision,
  dossier: ResearchDossier | null,
  genreTemplate: GenreTemplate,
  options: {
    angle?: string;
    mustInclude?: string[];
    mustAvoid?: string[];
    openrouterModel?: string;
  }
): Promise<BeatSpec[]> {
  // Build context from dossier
  const dossierContext = dossier ? 
    `\nRESEARCH AVAILABLE:
- ${dossier.facts.length} verified facts
- ${dossier.quotes.length} quotes
- ${dossier.timeline.length} timeline events
- Key facts: ${dossier.facts.slice(0, 5).map(f => `[${f.id}] ${f.statement}`).join('\n  ')}
${dossier.quotes.length > 0 ? `- Key quotes: ${dossier.quotes.slice(0, 2).map(q => `[${q.id}] "${q.quote.substring(0, 50)}..." - ${q.speaker}`).join('\n  ')}` : ''}` 
    : '\nNo research dossier available - using AI knowledge only.';

  const userPrompt = `Generate a section-by-section structure for this video:

TOPIC: ${topic}
${options.angle ? `ANGLE: ${options.angle}` : ''}
GENRE: ${genre}
TARGET DURATION: ${Math.round(durationDecision.recommendedDurationSeconds / 60)} minutes
TARGET TOTAL WORDS: ~${durationDecision.targetWordCount} words

SECTION WORD LIMITS:
- Each section must be 300-2000 words
- Sections can vary in length based on content needs
- Hook might be short (400 words), main development longer (1500 words)
- Let the story's natural structure determine section count and lengths

${dossierContext}

GENRE-SPECIFIC REQUIREMENTS:
${genreTemplate.requirements.join('\n')}

${options.mustInclude?.length ? `MUST INCLUDE: ${options.mustInclude.join(', ')}` : ''}
${options.mustAvoid?.length ? `MUST AVOID: ${options.mustAvoid.join(', ')}` : ''}

Determine the optimal number of sections based on the story's natural structure. Return as JSON:
{
  "beats": [
    {
      "index": 0,
      "type": "hook|setup|development|evidence|escalation|climax|resolution|callback",
      "section": "Opening|Act 1|Act 2|Act 3|Conclusion",
      "targetWords": 800,
      "contentSummary": "3-5 sentences describing this section in detail",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "factIds": ["FACT-001"],
      "quoteIds": [],
      "toneEnergy": {
        "mood": "curious|tense|excited|somber|triumphant",
        "pacing": "slow|medium|fast",
        "energyRelativeToPrevious": "lower|same|higher"
      },
      "engagementFunction": "Why viewer keeps watching through this section"
    }
  ]
}`;

  try {
    const response = await generateJSON<{ beats: BeatSpec[] }>(
      userId,
      UNIVERSAL_PROMPTS.spineGeneration,
      userPrompt,
      options.openrouterModel ? { model: options.openrouterModel } : undefined
    );

    return response.beats.map((b, i) => ({
      ...b,
      index: i,
    }));
  } catch (error) {
    console.error('[Spine] Error generating beat specs:', error);
    // Return a minimal fallback structure
    return generateFallbackBeats(durationDecision.beatCount, genre);
  }
}

/**
 * Generate fallback beat structure if AI fails
 */
function generateFallbackBeats(beatCount: number, _genre: ScriptGenre): BeatSpec[] {
  const beats: BeatSpec[] = [];
  
  for (let i = 0; i < beatCount; i++) {
    const position = i / beatCount;
    let type: BeatType;
    let section: string;

    if (i === 0) {
      type = 'hook';
      section = 'Opening';
    } else if (position < 0.15) {
      type = 'setup';
      section = 'Opening';
    } else if (position < 0.4) {
      type = 'information';
      section = 'Act 1';
    } else if (position < 0.75) {
      type = position < 0.6 ? 'escalation' : 'evidence';
      section = 'Act 2';
    } else if (position < 0.85) {
      type = 'climax';
      section = 'Act 3';
    } else {
      type = 'resolution';
      section = 'Conclusion';
    }

    beats.push({
      index: i,
      type,
      section,
      contentSummary: `Beat ${i + 1} content`,
      keyPoints: [],
      factIds: [],
      quoteIds: [],
      toneEnergy: {
        mood: 'neutral',
        pacing: 'medium',
        energyRelativeToPrevious: 'same',
      },
      engagementFunction: 'Continue story',
    });
  }

  return beats;
}

/**
 * Create beats with proper timing from specifications
 */
function createBeatsWithTiming(
  beatSpecs: BeatSpec[],
  durationDecision: DurationDecision
): Beat[] {
  const totalSeconds = durationDecision.recommendedDurationSeconds;
  const beatDuration = totalSeconds / beatSpecs.length;

  return beatSpecs.map((spec, index) => {
    const startSeconds = Math.round(index * beatDuration);
    const endSeconds = Math.round((index + 1) * beatDuration);

    return createBeatFromSpec(spec, {
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
    });
  });
}

/**
 * Build sections from beats
 */
function buildSections(
  beats: Beat[],
  _genreTemplate: GenreTemplate
): Spine['sections'] {
  const sectionMap = new Map<string, { start: number; end: number }>();

  for (let i = 0; i < beats.length; i++) {
    const sectionName = beats[i].classification.section;
    const existing = sectionMap.get(sectionName);

    if (!existing) {
      sectionMap.set(sectionName, { start: i, end: i });
    } else {
      existing.end = i;
    }
  }

  return Array.from(sectionMap.entries()).map(([name, range]) => ({
    name,
    startBeatIndex: range.start,
    endBeatIndex: range.end,
  }));
}

/**
 * Extract open loops from beats
 */
function extractOpenLoops(beats: Beat[]): Spine['openLoops'] {
  const loops: Spine['openLoops'] = [];
  const loopMap = new Map<string, { openedAt: number; question: string }>();

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    
    if (beat.engagement.opensLoop && beat.engagement.loopId) {
      loopMap.set(beat.engagement.loopId, {
        openedAt: i,
        question: (beat.contentSummary || '').substring(0, 100),
      });
    }

    if (beat.engagement.closesLoop && beat.engagement.loopId) {
      const opened = loopMap.get(beat.engagement.loopId);
      if (opened) {
        loops.push({
          id: beat.engagement.loopId,
          openedAtBeatIndex: opened.openedAt,
          closedAtBeatIndex: i,
          question: opened.question,
        });
        loopMap.delete(beat.engagement.loopId);
      }
    }
  }

  // Add unclosed loops
  for (const [id, data] of loopMap) {
    loops.push({
      id,
      openedAtBeatIndex: data.openedAt,
      question: data.question,
    });
  }

  return loops;
}

/**
 * Collect warnings from generation
 */
function collectWarnings(
  validation: EngagementValidation,
  actualBeats: number,
  targetBeats: number
): string[] {
  const warnings: string[] = [];

  if (actualBeats !== targetBeats) {
    warnings.push(`Generated ${actualBeats} beats, target was ${targetBeats}`);
  }

  if (!validation.hasHook) {
    warnings.push('No clear hook in opening beats');
  }

  if (validation.unclosedLoops.length > 0) {
    warnings.push(`${validation.unclosedLoops.length} unclosed loops detected`);
  }

  if (validation.patternInterruptGaps.length > 0) {
    warnings.push(`${validation.patternInterruptGaps.length} long gaps without pattern interrupts`);
  }

  return warnings;
}
