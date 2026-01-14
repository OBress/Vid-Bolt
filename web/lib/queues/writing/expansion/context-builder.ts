/**
 * Context Builder
 * ============================================================================
 * Builds rich context for AI writers to enable high-quality, non-repetitive
 * script generation with smooth transitions.
 */

import type { 
  Spine, 
  Beat,
  ExpandedBeat, 
  ContinuityState,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface PreviousBeatContext {
  index: number;
  title: string;
  summary: string;
  lastParagraph: string;
}

export interface WritingContext {
  /** Full video structure as a readable summary */
  videoSkeleton: string;
  
  /** Current position in the video (e.g., "Beat 5 of 12 (Act 2: Rising Action)") */
  currentBeatPosition: string;
  
  /** Context from multiple previous beats for continuity */
  previousBeats: PreviousBeatContext[];
  
  /** Summary of the next beat (so AI can set it up) */
  nextBeatSummary: string;
  
  /** Phrases already used (to avoid repetition) */
  usedPhrases: string[];
  
  /** Sentence openers already used (to vary sentence starts) */
  usedSentenceOpeners: string[];
  
  /** Transition phrases already used */
  usedTransitions: string[];
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build comprehensive writing context for beat expansion
 */
export function buildWritingContext(
  spine: Spine,
  currentBeatIndex: number,
  previousExpandedBeats: ExpandedBeat[],
  continuityState: ContinuityState
): WritingContext {
  const currentBeat = spine.beats[currentBeatIndex];
  
  return {
    videoSkeleton: buildVideoSkeleton(spine, currentBeatIndex),
    currentBeatPosition: buildPositionString(spine, currentBeatIndex, currentBeat),
    previousBeats: buildPreviousBeatsContext(spine, currentBeatIndex, previousExpandedBeats),
    nextBeatSummary: buildNextBeatSummary(spine, currentBeatIndex),
    usedPhrases: continuityState.usedPhrases || [],
    usedSentenceOpeners: continuityState.usedOpeners || [],
    usedTransitions: continuityState.usedTransitions || [],
  };
}

// ============================================================================
// VIDEO SKELETON
// ============================================================================

/**
 * Build a readable summary of the entire video structure
 * Highlights the current beat position
 */
function buildVideoSkeleton(spine: Spine, currentBeatIndex: number): string {
  const lines: string[] = [
    `VIDEO: "${spine.title || 'Untitled'}"`,
    `Total Duration: ~${Math.round(spine.totalDurationSeconds / 60)} minutes`,
    `Structure: ${spine.beatCount} beats`,
    '',
    'BEAT ROADMAP:',
  ];

  // Group beats by section/act for cleaner output
  let currentSection = '';
  
  for (let i = 0; i < spine.beats.length; i++) {
    const beat = spine.beats[i];
    const section = beat.classification.section || 'Main';
    const isCurrent = i === currentBeatIndex;
    
    // Add section header if changed
    if (section !== currentSection) {
      currentSection = section;
      lines.push(`\n[${section.toUpperCase()}]`);
    }
    
    // Format beat line
    const marker = isCurrent ? '>>> ' : '    ';
    const status = isCurrent ? ' <-- YOU ARE HERE' : '';
    const beatType = beat.classification.type;
    const summary = beat.contentSummary.substring(0, 60);
    
    lines.push(`${marker}Beat ${i + 1} (${beatType}): ${summary}...${status}`);
  }

  return lines.join('\n');
}

// ============================================================================
// POSITION STRING
// ============================================================================

/**
 * Build a human-readable position string
 */
function buildPositionString(spine: Spine, beatIndex: number, beat: Beat): string {
  const section = beat.classification.section || 'Main';
  const beatType = beat.classification.type;
  const progress = Math.round((beatIndex / spine.beats.length) * 100);
  
  return `Beat ${beatIndex + 1} of ${spine.beatCount} | ${section} | ${beatType} | ${progress}% through video`;
}

// ============================================================================
// PREVIOUS BEATS CONTEXT
// ============================================================================

/**
 * Build context from the last 3 beats (or fewer if not available)
 */
function buildPreviousBeatsContext(
  spine: Spine,
  currentBeatIndex: number,
  previousExpandedBeats: ExpandedBeat[]
): PreviousBeatContext[] {
  const context: PreviousBeatContext[] = [];
  const numPreviousBeats = Math.min(3, currentBeatIndex);
  
  for (let i = numPreviousBeats; i > 0; i--) {
    const beatIndex = currentBeatIndex - i;
    const spineBeat = spine.beats[beatIndex];
    const expandedBeat = previousExpandedBeats[beatIndex];
    
    if (!spineBeat) continue;
    
    context.push({
      index: beatIndex + 1,
      title: spineBeat.classification.type,
      summary: spineBeat.contentSummary.substring(0, 150),
      lastParagraph: expandedBeat 
        ? extractLastParagraph(expandedBeat.narration)
        : spineBeat.contentSummary.substring(0, 100),
    });
  }
  
  return context;
}

/**
 * Extract the last paragraph from narration text
 */
function extractLastParagraph(narration: string): string {
  const paragraphs = narration.split(/\n\n+/).filter(p => p.trim());
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  
  // Limit length for context window
  if (lastParagraph.length > 300) {
    return lastParagraph.substring(lastParagraph.length - 300);
  }
  
  return lastParagraph;
}

// ============================================================================
// NEXT BEAT SUMMARY
// ============================================================================

/**
 * Get summary of the next beat (so AI can set it up)
 */
function buildNextBeatSummary(spine: Spine, currentBeatIndex: number): string {
  const nextIndex = currentBeatIndex + 1;
  
  if (nextIndex >= spine.beats.length) {
    return 'This is the FINAL beat. End with a strong conclusion.';
  }
  
  const nextBeat = spine.beats[nextIndex];
  return `NEXT: Beat ${nextIndex + 1} (${nextBeat.classification.type}) - ${nextBeat.contentSummary.substring(0, 100)}...`;
}

// ============================================================================
// PHRASE EXTRACTION
// ============================================================================

/**
 * Extract distinctive phrases from text (for repetition tracking)
 * Finds 3-5 word phrases that are significant
 */
export function extractDistinctivePhrases(text: string): string[] {
  const phrases: string[] = [];
  
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    
    // Extract 3-5 word sequences that might be distinctive
    for (let len = 3; len <= 5; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ').toLowerCase();
        
        // Filter out common/boring phrases
        if (isDistinctivePhrase(phrase)) {
          phrases.push(phrase);
        }
      }
    }
  }
  
  // Deduplicate and limit
  return [...new Set(phrases)].slice(0, 20);
}

/**
 * Check if a phrase is distinctive enough to track
 */
function isDistinctivePhrase(phrase: string): boolean {
  const boringStarters = [
    'the', 'a', 'an', 'this', 'that', 'it', 'is', 'was', 'are', 'were',
    'and', 'but', 'or', 'so', 'if', 'when', 'while', 'as', 'for', 'to',
  ];
  
  const firstWord = phrase.split(' ')[0];
  if (boringStarters.includes(firstWord)) {
    return false;
  }
  
  // Must have at least some content words
  if (phrase.length < 10) {
    return false;
  }
  
  return true;
}

/**
 * Extract sentence openers (first 3 words of each sentence)
 */
export function extractSentenceOpeners(text: string): string[] {
  const openers: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).slice(0, 3);
    if (words.length >= 2) {
      openers.push(words.join(' ').toLowerCase());
    }
  }
  
  return [...new Set(openers)];
}

/**
 * Extract transition phrases
 */
export function extractTransitionPhrases(text: string): string[] {
  const transitionPatterns = [
    // Time-based
    /\b(meanwhile|later|soon after|shortly|eventually|finally)\b/gi,
    /\b(at this point|by now|at that moment)\b/gi,
    // Contrast
    /\b(however|but|yet|nevertheless|nonetheless|on the other hand)\b/gi,
    // Addition
    /\b(furthermore|moreover|additionally|in addition|what's more)\b/gi,
    // Cause/effect
    /\b(therefore|thus|consequently|as a result|because of this)\b/gi,
    // Example
    /\b(for example|for instance|such as|like|including)\b/gi,
  ];
  
  const transitions: string[] = [];
  
  for (const pattern of transitionPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      transitions.push(...matches.map(m => m.toLowerCase()));
    }
  }
  
  return [...new Set(transitions)];
}

// ============================================================================
// FORMAT CONTEXT FOR PROMPT
// ============================================================================

/**
 * Format the writing context into a string for the prompt
 */
export function formatContextForPrompt(context: WritingContext): string {
  const lines: string[] = [];
  
  // Video skeleton
  lines.push('=== VIDEO SKELETON (your roadmap) ===');
  lines.push(context.videoSkeleton);
  lines.push('');
  
  // Current position
  lines.push('=== YOUR CURRENT POSITION ===');
  lines.push(context.currentBeatPosition);
  lines.push('');
  
  // Previous beats
  if (context.previousBeats.length > 0) {
    lines.push('=== PREVIOUS CONTEXT (for smooth transition) ===');
    for (const prev of context.previousBeats) {
      lines.push(`Beat ${prev.index} (${prev.title}): ${prev.summary}`);
    }
    const lastBeat = context.previousBeats[context.previousBeats.length - 1];
    if (lastBeat) {
      lines.push(`\nLAST PARAGRAPH: "${lastBeat.lastParagraph}"`);
    }
    lines.push('');
  }
  
  // Next beat preview
  lines.push('=== NEXT BEAT PREVIEW (so you can set it up) ===');
  lines.push(context.nextBeatSummary);
  lines.push('');
  
  // Avoid repetition
  if (context.usedPhrases.length > 0) {
    lines.push('=== AVOID REPETITION ===');
    lines.push('DO NOT use these phrases (already used):');
    lines.push(context.usedPhrases.slice(0, 10).join(', '));
    lines.push('');
  }
  
  if (context.usedSentenceOpeners.length > 0) {
    lines.push('DO NOT start sentences with:');
    lines.push(context.usedSentenceOpeners.slice(0, 10).join(', '));
    lines.push('');
  }
  
  return lines.join('\n');
}
