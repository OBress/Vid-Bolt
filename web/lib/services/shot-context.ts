/**
 * Shot Neighbor Context Service
 * ============================================================================
 * Centralized utility for building rich context about surrounding shots.
 * Every pipeline worker can call this to get awareness of neighboring shots'
 * visual prompts, decisions, and generated media — enabling organic scene
 * coherence without explicit scene IDs.
 *
 * The core insight: when every agent knows what the shots around it look like,
 * visual consistency emerges naturally from prompt enrichment.
 */

import type { PlannedShot } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

export interface ShotNeighborInfo {
  segment_index: number;
  visual_prompt: string;
  summary: string;
  media_type: string;
  content_type: string;
  shot_role?: string;
  visual_motif?: string;
  subject_focus?: string;
  exit_transition_intent?: string;
  /** Generated media URL (available after generation phase) */
  generated_url?: string;
}

export interface ShotNeighborContext {
  /** Previous shots (closest first — index 0 is the immediately preceding shot) */
  previous: ShotNeighborInfo[];
  /** Next shots (closest first — index 0 is the immediately following shot) */
  next: ShotNeighborInfo[];
  /** Ready-to-inject style consistency note for prompts */
  styleConsistencyNote: string;
  /** Compact version for token-sensitive contexts (image/video generation) */
  compactNote: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[ShotContext]';
const DEFAULT_WINDOW_SIZE = 2;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get rich neighbor context for a shot at a given index.
 *
 * @param allShots - The full shot list (sorted by segment_index)
 * @param currentIndex - Index into allShots for the current shot
 * @param windowSize - How many previous/next shots to include (default: 2)
 * @param generatedMedia - Optional map of segment_index → generated media URL
 * @returns Context object with neighbor info and pre-built consistency notes
 */
export function getShotNeighborContext(
  allShots: Array<Pick<PlannedShot, 'segment_index' | 'summary' | 'media_type' | 'content_type' | 'visual_description' | 'visual_elements' | 'text' | 'shot_role' | 'visual_motif' | 'subject_focus' | 'exit_transition_intent'>>,
  currentIndex: number,
  windowSize: number = DEFAULT_WINDOW_SIZE,
  generatedMedia?: Record<string, string>
): ShotNeighborContext {
  const previous: ShotNeighborInfo[] = [];
  const next: ShotNeighborInfo[] = [];

  // Collect previous shots (walk backward from current, closest first)
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - windowSize); i--) {
    const shot = allShots[i];
    previous.push(toNeighborInfo(shot, generatedMedia));
  }

  // Collect next shots (walk forward from current, closest first)
  for (let i = currentIndex + 1; i <= Math.min(allShots.length - 1, currentIndex + windowSize); i++) {
    const shot = allShots[i];
    next.push(toNeighborInfo(shot, generatedMedia));
  }

  // Build the style consistency notes
  const styleConsistencyNote = buildStyleNote(previous, next, allShots[currentIndex]);
  const compactNote = buildCompactNote(previous, next);

  return { previous, next, styleConsistencyNote, compactNote };
}

/**
 * Build context for MG generation — includes richer descriptions
 * since MG prompts are more token-tolerant than diffusion prompts.
 */
export function getShotNeighborContextForMG(
  allShots: Array<Pick<PlannedShot, 'segment_index' | 'summary' | 'media_type' | 'content_type' | 'visual_description' | 'visual_elements' | 'text' | 'shot_role' | 'visual_motif' | 'subject_focus' | 'exit_transition_intent'>>,
  currentIndex: number,
  generatedMedia?: Record<string, string>
): string {
  const ctx = getShotNeighborContext(allShots, currentIndex, 2, generatedMedia);

  const parts: string[] = [];
  parts.push('\n\nSURROUNDING SHOT CONTEXT (for visual continuity):');

  if (ctx.previous.length > 0) {
    parts.push('\nPrevious shots (what the viewer just saw):');
    ctx.previous.forEach((p, i) => {
      parts.push(`  ${i + 1}. [${p.media_type}] "${p.visual_prompt}"`);
    });
  }

  if (ctx.next.length > 0) {
    parts.push('\nNext shots (what the viewer will see after):');
    ctx.next.forEach((n, i) => {
      parts.push(`  ${i + 1}. [${n.media_type}] "${n.visual_prompt}"`);
    });
  }

  parts.push(`\n${ctx.styleConsistencyNote}`);

  return parts.join('\n');
}

// ============================================================================
// THEMATIC SIMILARITY (for scene-harmonizer)
// ============================================================================

/**
 * Detect whether two shots are thematically related based on visual prompt
 * keyword overlap. Used by the scene harmonizer to group shots into
 * visual sequences for post-generation harmonization.
 *
 * @returns Similarity score 0.0–1.0 (higher = more related)
 */
export function computeThematicSimilarity(
  shotA: Pick<PlannedShot, 'summary' | 'visual_description' | 'text' | 'entity_refs'>,
  shotB: Pick<PlannedShot, 'summary' | 'visual_description' | 'text' | 'entity_refs'>
): number {
  // 1. Entity overlap (strongest signal)
  const entityRefsA = new Set(shotA.entity_refs || []);
  const entityRefsB = new Set(shotB.entity_refs || []);
  const sharedEntities = [...entityRefsA].filter(e => entityRefsB.has(e)).length;
  const totalEntities = new Set([...entityRefsA, ...entityRefsB]).size;
  const entityScore = totalEntities > 0 ? sharedEntities / totalEntities : 0;

  // 2. Visual prompt keyword overlap
  const wordsA = extractKeywords(shotA.visual_description || shotA.summary || '');
  const wordsB = extractKeywords(shotB.visual_description || shotB.summary || '');
  const sharedWords = wordsA.filter(w => wordsB.includes(w)).length;
  const totalWords = new Set([...wordsA, ...wordsB]).size;
  const wordScore = totalWords > 0 ? sharedWords / totalWords : 0;

  // Weighted combination: entities are a stronger signal than keyword overlap
  return Math.min(1.0, entityScore * 0.6 + wordScore * 0.4);
}

/**
 * Group consecutive shots into visual sequences based on thematic similarity.
 * Used by the scene harmonizer to determine which shots should be harmonized.
 *
 * @param shots - All shots sorted by segment_index
 * @param threshold - Minimum similarity score to group shots (default: 0.25)
 * @returns Array of shot groups (each group is an array of shot indices)
 */
export function groupIntoVisualSequences(
  shots: Array<Pick<PlannedShot, 'segment_index' | 'summary' | 'visual_description' | 'text' | 'entity_refs' | 'media_type'>>,
  threshold: number = 0.25
): number[][] {
  if (shots.length === 0) return [];

  const groups: number[][] = [[0]]; // Start with the first shot in its own group

  for (let i = 1; i < shots.length; i++) {
    const prevShot = shots[i - 1];
    const currShot = shots[i];
    const similarity = computeThematicSimilarity(prevShot, currShot);

    if (similarity >= threshold) {
      // Continue the current group
      groups[groups.length - 1].push(i);
    } else {
      // Start a new group
      groups.push([i]);
    }
  }

  return groups;
}

// ============================================================================
// HELPERS
// ============================================================================

function toNeighborInfo(
  shot: Pick<PlannedShot, 'segment_index' | 'summary' | 'media_type' | 'content_type' | 'visual_description' | 'visual_elements' | 'text' | 'shot_role' | 'visual_motif' | 'subject_focus' | 'exit_transition_intent'>,
  generatedMedia?: Record<string, string>
): ShotNeighborInfo {
  return {
    segment_index: shot.segment_index,
    visual_prompt: shot.visual_description || shot.summary || shot.text?.substring(0, 100) || '',
    summary: shot.summary || '',
    media_type: shot.media_type,
    content_type: shot.content_type,
    shot_role: shot.shot_role || undefined,
    visual_motif: shot.visual_motif || undefined,
    subject_focus: shot.subject_focus || undefined,
    exit_transition_intent: shot.exit_transition_intent || undefined,
    generated_url: generatedMedia?.[`shot-${shot.segment_index}`],
  };
}

/**
 * Build a full style consistency note for rich prompt contexts (MG, edit assembly).
 */
function buildStyleNote(
  previous: ShotNeighborInfo[],
  next: ShotNeighborInfo[],
  _currentShot?: Pick<PlannedShot, 'segment_index' | 'summary' | 'media_type' | 'content_type' | 'visual_description' | 'visual_elements' | 'text'>
): string {
  const parts: string[] = [];

  if (previous.length > 0) {
    const prevPrompt = previous[0].visual_prompt;
    parts.push(
      `STYLE CONTINUITY: The immediately preceding shot shows "${prevPrompt}". ` +
      `Maintain visual consistency — match the color palette, lighting atmosphere, ` +
      `and artistic style where appropriate.`
    );
  }

  if (next.length > 0) {
    const nextPrompt = next[0].visual_prompt;
    parts.push(
      `The following shot will show "${nextPrompt}". ` +
      `Create a natural visual bridge — your output should feel like it belongs ` +
      `between these scenes.`
    );
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join(' ');
}

/**
 * Build a compact style note for token-sensitive contexts (image/video diffusion).
 * Kept under ~30 words to avoid diluting the main prompt.
 */
function buildCompactNote(
  previous: ShotNeighborInfo[],
  _next: ShotNeighborInfo[]
): string {
  if (previous.length === 0) return '';

  // Extract the dominant visual keywords from the previous shot
  const prevPrompt = previous[0].visual_prompt;
  const keywords = extractKeywords(prevPrompt).slice(0, 5).join(', ');

  if (!keywords) return '';

  const previousShot = previous[0];
  const addOns = [
    previousShot.visual_motif ? `motif ${previousShot.visual_motif}` : '',
    previousShot.subject_focus ? `focus ${previousShot.subject_focus}` : '',
    previousShot.exit_transition_intent ? `exit ${previousShot.exit_transition_intent}` : '',
  ].filter(Boolean).join('; ');

  return addOns
    ? `Maintain visual continuity with: ${keywords}. Continue ${addOns}.`
    : `Maintain visual continuity with: ${keywords}.`;
}

/**
 * Extract meaningful keywords from a visual prompt, filtering stop words.
 */
function extractKeywords(text: string): string[] {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'and',
    'but', 'or', 'nor', 'not', 'so', 'yet', 'that', 'this', 'these',
    'those', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who',
    'whom', 'whose', 'up', 'down', 'about', 'show', 'shows', 'showing',
    'shot', 'scene', 'visual', 'image',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}
