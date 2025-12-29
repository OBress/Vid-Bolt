/**
 * Content Structure Analyzer
 * ============================================================================
 * Analyzes script content to identify structural patterns that inform
 * intelligent segmentation: lists, comparisons, transitions, emotional beats.
 */

import { WordTimestamp } from "@/types/task";
import {
  ContentAnalysis,
  ListSpan,
  ComparisonSpan,
  TransitionSpan,
  EmotionalBeatSpan,
  ORDINAL_MARKERS,
  COMPARISON_MARKERS,
  TRANSITION_MARKERS,
  SENTENCE_ENDINGS,
} from "./types";

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze script content to identify structural patterns.
 * This informs how aggressively to segment the timeline.
 */
export function analyzeContentStructure(
  script: string,
  wordTimestamps: WordTimestamp[]
): ContentAnalysis {
  const words = wordTimestamps.map(wt => wt.word.toLowerCase().trim());
  
  return {
    lists: detectLists(words, wordTimestamps),
    comparisons: detectComparisons(words, wordTimestamps),
    transitions: detectTransitions(words, wordTimestamps),
    emotional_beats: detectEmotionalBeats(words, wordTimestamps),
    full_text: script,
    word_count: words.length,
  };
}

// ============================================================================
// LIST DETECTION
// ============================================================================

/**
 * Detect list structures using multiple heuristics:
 * 1. Ordinal markers (first, second, third...)
 * 2. Serial commas (a, b, and c)
 * 3. Parallel verb structure (won..., earned..., scored...)
 * 4. Numeric patterns (six X, five Y, fourteen Z)
 */
export function detectLists(
  words: string[],
  wordTimestamps: WordTimestamp[]
): ListSpan[] {
  const lists: ListSpan[] = [];
  
  // Strategy 1: Ordinal markers
  const ordinalLists = detectOrdinalLists(words);
  lists.push(...ordinalLists);
  
  // Strategy 2: Serial commas with items
  const commaLists = detectCommaSeriesLists(words, wordTimestamps);
  lists.push(...commaLists);
  
  // Strategy 3: Parallel structure (verb repetition)
  const parallelLists = detectParallelStructureLists(words, wordTimestamps);
  lists.push(...parallelLists);
  
  // Merge overlapping lists, prefer more granular item detection
  return mergeOverlappingSpans(lists);
}

/**
 * Detect lists using ordinal markers like "first", "second", "next".
 */
function detectOrdinalLists(words: string[]): ListSpan[] {
  const lists: ListSpan[] = [];
  const ordinalIndices: number[] = [];
  
  // Find all ordinal markers
  words.forEach((word, index) => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    if (ORDINAL_MARKERS.includes(cleanWord as any)) {
      ordinalIndices.push(index);
    }
  });
  
  // Group consecutive ordinals into lists (within reasonable distance)
  if (ordinalIndices.length >= 2) {
    let listStart = ordinalIndices[0];
    let items: Array<{ start_index: number; end_index: number }> = [];
    let lastOrdinalIndex = ordinalIndices[0];
    
    for (let i = 0; i < ordinalIndices.length; i++) {
      const currentIndex = ordinalIndices[i];
      const nextIndex = ordinalIndices[i + 1];
      
      // Start new item at this ordinal
      const itemStart = currentIndex;
      // Item ends at next ordinal or end of sentence
      const itemEnd = nextIndex !== undefined 
        ? nextIndex 
        : findSentenceEnd(words, currentIndex);
      
      items.push({ start_index: itemStart, end_index: itemEnd });
      
      // Check if next ordinal is too far away (>50 words = likely new list)
      if (nextIndex !== undefined && nextIndex - currentIndex > 50) {
        // Save current list and start new one
        if (items.length >= 2) {
          lists.push({
            start_index: listStart,
            end_index: items[items.length - 1].end_index,
            items: [...items],
            detection_method: 'ordinal',
          });
        }
        items = [];
        listStart = nextIndex;
      }
      
      lastOrdinalIndex = currentIndex;
    }
    
    // Save final list if we have items
    if (items.length >= 2) {
      lists.push({
        start_index: listStart,
        end_index: items[items.length - 1].end_index,
        items,
        detection_method: 'ordinal',
      });
    }
  }
  
  return lists;
}

/**
 * Detect comma-separated series (a, b, and c).
 */
function detectCommaSeriesLists(
  words: string[],
  wordTimestamps: WordTimestamp[]
): ListSpan[] {
  const lists: ListSpan[] = [];
  
  // Look for patterns: word, word, word, and word
  // or: word, word, word
  for (let i = 0; i < words.length - 3; i++) {
    const commaPositions: number[] = [];
    let andPosition = -1;
    
    // Scan forward for comma pattern
    for (let j = i; j < Math.min(i + 30, words.length); j++) {
      const originalWord = wordTimestamps[j].word;
      if (originalWord.endsWith(',')) {
        commaPositions.push(j);
      }
      if (words[j] === 'and' || words[j] === 'or') {
        andPosition = j;
        break; // Stop at conjunction
      }
    }
    
    // Need at least 2 commas for a list, or 1 comma + and/or
    if (commaPositions.length >= 2 || (commaPositions.length >= 1 && andPosition > commaPositions[0])) {
      const items: Array<{ start_index: number; end_index: number }> = [];
      
      // First item: from start to first comma
      items.push({ start_index: i, end_index: commaPositions[0] + 1 });
      
      // Middle items: between commas
      for (let k = 0; k < commaPositions.length - 1; k++) {
        items.push({ 
          start_index: commaPositions[k] + 1, 
          end_index: commaPositions[k + 1] + 1 
        });
      }
      
      // Last item: after last comma (or after 'and')
      const lastComma = commaPositions[commaPositions.length - 1];
      let listEnd: number;
      
      if (andPosition > lastComma) {
        // Item after 'and'
        listEnd = findItemEnd(words, andPosition + 1);
        items.push({ start_index: andPosition + 1, end_index: listEnd });
      } else {
        listEnd = findItemEnd(words, lastComma + 1);
        items.push({ start_index: lastComma + 1, end_index: listEnd });
      }
      
      if (items.length >= 3) {
        lists.push({
          start_index: i,
          end_index: listEnd,
          items,
          detection_method: 'comma-series',
        });
        
        // Skip past this list
        i = listEnd - 1;
      }
    }
  }
  
  return lists;
}

/**
 * Detect parallel verb structures (won X, earned Y, scored Z).
 */
function detectParallelStructureLists(
  words: string[],
  wordTimestamps: WordTimestamp[]
): ListSpan[] {
  const lists: ListSpan[] = [];
  
  // Common past-tense verb patterns in lists
  const pastVerbs = ['won', 'earned', 'made', 'scored', 'achieved', 'received', 
                     'created', 'built', 'designed', 'developed', 'launched'];
  
  // Find sequences of similar verb patterns
  const verbPositions: Array<{ verb: string; index: number }> = [];
  
  words.forEach((word, index) => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    if (pastVerbs.includes(cleanWord)) {
      verbPositions.push({ verb: cleanWord, index });
    }
  });
  
  // Look for 3+ verbs within reasonable distance
  if (verbPositions.length >= 3) {
    for (let i = 0; i < verbPositions.length - 2; i++) {
      const cluster: typeof verbPositions = [verbPositions[i]];
      
      for (let j = i + 1; j < verbPositions.length; j++) {
        // Within 15 words of each other
        if (verbPositions[j].index - cluster[cluster.length - 1].index <= 15) {
          cluster.push(verbPositions[j]);
        } else {
          break;
        }
      }
      
      if (cluster.length >= 3) {
        const items = cluster.map((v, idx) => ({
          start_index: v.index,
          end_index: idx < cluster.length - 1 
            ? cluster[idx + 1].index 
            : findItemEnd(words, v.index),
        }));
        
        lists.push({
          start_index: cluster[0].index,
          end_index: items[items.length - 1].end_index,
          items,
          detection_method: 'parallel-structure',
        });
        
        // Skip past this detected list
        i += cluster.length - 1;
      }
    }
  }
  
  return lists;
}

// ============================================================================
// COMPARISON DETECTION
// ============================================================================

/**
 * Detect comparison structures (on one hand... on the other hand).
 */
export function detectComparisons(
  words: string[],
  wordTimestamps: WordTimestamp[]
): ComparisonSpan[] {
  const comparisons: ComparisonSpan[] = [];
  const text = words.join(' ');
  
  // Look for explicit comparison markers
  for (let i = 0; i < words.length - 5; i++) {
    // Check for "on one hand" style patterns
    const threeWordPhrase = words.slice(i, i + 3).join(' ');
    const fourWordPhrase = words.slice(i, i + 4).join(' ');
    
    let sideAStart = -1;
    let sideBStart = -1;
    
    // Check for side A markers
    for (const marker of COMPARISON_MARKERS.SIDE_A) {
      if (threeWordPhrase.includes(marker) || fourWordPhrase.includes(marker)) {
        sideAStart = i;
        break;
      }
    }
    
    if (sideAStart !== -1) {
      // Look for side B marker
      for (let j = sideAStart + 3; j < Math.min(sideAStart + 50, words.length - 3); j++) {
        const phrase = words.slice(j, j + 4).join(' ');
        
        for (const marker of COMPARISON_MARKERS.SIDE_B) {
          if (phrase.includes(marker)) {
            sideBStart = j;
            break;
          }
        }
        if (sideBStart !== -1) break;
      }
      
      if (sideBStart !== -1) {
        const sideBEnd = findSentenceEnd(words, sideBStart);
        comparisons.push({
          start_index: sideAStart,
          end_index: sideBEnd,
          side_a: { start_index: sideAStart, end_index: sideBStart },
          side_b: { start_index: sideBStart, end_index: sideBEnd },
        });
        
        i = sideBEnd - 1;
      }
    }
  }
  
  return comparisons;
}

// ============================================================================
// TRANSITION DETECTION
// ============================================================================

/**
 * Detect topic transitions.
 */
export function detectTransitions(
  words: string[],
  wordTimestamps: WordTimestamp[]
): TransitionSpan[] {
  const transitions: TransitionSpan[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,!?;:]/g, '');
    const twoWordPhrase = words.slice(i, i + 2).join(' ');
    
    for (const marker of TRANSITION_MARKERS) {
      if (word === marker || twoWordPhrase.startsWith(marker)) {
        // Find the clause/sentence boundary
        const endIndex = findClauseEnd(words, i);
        
        transitions.push({
          start_index: i,
          end_index: endIndex,
          marker: marker,
        });
        
        i = endIndex - 1;
        break;
      }
    }
  }
  
  return transitions;
}

// ============================================================================
// EMOTIONAL BEAT DETECTION
// ============================================================================

/**
 * Detect emotional/impactful moments that need time to land.
 */
export function detectEmotionalBeats(
  words: string[],
  wordTimestamps: WordTimestamp[]
): EmotionalBeatSpan[] {
  const beats: EmotionalBeatSpan[] = [];
  
  // Patterns that indicate emotional weight
  const climaxMarkers = ['finally', 'ultimately', 'at last', 'in the end'];
  const revelationMarkers = ['discovered', 'realized', 'revealed', 'unveiled'];
  const conclusionMarkers = ['legacy', 'forever', 'history', 'changed', 'transformed'];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,!?;:]/g, '');
    const phrase = words.slice(i, i + 3).join(' ');
    
    let beatType: 'climax' | 'revelation' | 'conclusion' | 'pause' | null = null;
    
    if (climaxMarkers.some(m => word === m || phrase.includes(m))) {
      beatType = 'climax';
    } else if (revelationMarkers.includes(word)) {
      beatType = 'revelation';
    } else if (conclusionMarkers.includes(word)) {
      beatType = 'conclusion';
    }
    
    if (beatType) {
      const endIndex = findSentenceEnd(words, i);
      beats.push({
        start_index: i,
        end_index: endIndex,
        beat_type: beatType,
      });
      i = endIndex - 1;
    }
  }
  
  return beats;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find the end of a sentence starting from an index.
 */
function findSentenceEnd(words: string[], startIndex: number): number {
  for (let i = startIndex; i < words.length; i++) {
    const word = words[i];
    if (SENTENCE_ENDINGS.some(ending => word.endsWith(ending))) {
      return i + 1;
    }
  }
  return words.length;
}

/**
 * Find the end of a clause (sentence or semicolon/colon boundary).
 */
function findClauseEnd(words: string[], startIndex: number): number {
  for (let i = startIndex; i < words.length; i++) {
    const word = words[i];
    if (SENTENCE_ENDINGS.some(ending => word.endsWith(ending)) ||
        word.endsWith(';') || word.endsWith(':')) {
      return i + 1;
    }
  }
  return words.length;
}

/**
 * Find the end of a list item (comma or sentence boundary).
 */
function findItemEnd(words: string[], startIndex: number): number {
  for (let i = startIndex; i < words.length; i++) {
    const word = words[i];
    if (word.endsWith(',') || SENTENCE_ENDINGS.some(ending => word.endsWith(ending))) {
      return i + 1;
    }
  }
  return Math.min(startIndex + 10, words.length);
}

/**
 * Merge overlapping list spans, preferring the one with more items.
 */
function mergeOverlappingSpans(lists: ListSpan[]): ListSpan[] {
  if (lists.length <= 1) return lists;
  
  // Sort by start index
  const sorted = [...lists].sort((a, b) => a.start_index - b.start_index);
  const merged: ListSpan[] = [];
  
  for (const list of sorted) {
    const lastMerged = merged[merged.length - 1];
    
    if (!lastMerged || list.start_index >= lastMerged.end_index) {
      // No overlap
      merged.push(list);
    } else {
      // Overlap - keep the one with more items
      if (list.items.length > lastMerged.items.length) {
        merged[merged.length - 1] = list;
      }
    }
  }
  
  return merged;
}

/**
 * Check if a word index falls within any list span.
 */
export function isInList(wordIndex: number, analysis: ContentAnalysis): ListSpan | null {
  for (const list of analysis.lists) {
    if (wordIndex >= list.start_index && wordIndex < list.end_index) {
      return list;
    }
  }
  return null;
}

/**
 * Check if a word index falls within any comparison span.
 */
export function isInComparison(wordIndex: number, analysis: ContentAnalysis): ComparisonSpan | null {
  for (const comparison of analysis.comparisons) {
    if (wordIndex >= comparison.start_index && wordIndex < comparison.end_index) {
      return comparison;
    }
  }
  return null;
}

/**
 * Get the content type for a word index based on analysis.
 */
export function getContentTypeForWord(
  wordIndex: number, 
  analysis: ContentAnalysis
): 'list-item' | 'comparison' | 'transition' | 'emotional-beat' | 'concept' {
  // Check lists first (most specific)
  if (isInList(wordIndex, analysis)) {
    return 'list-item';
  }
  
  // Check comparisons
  if (isInComparison(wordIndex, analysis)) {
    return 'comparison';
  }
  
  // Check transitions
  for (const transition of analysis.transitions) {
    if (wordIndex >= transition.start_index && wordIndex < transition.end_index) {
      return 'transition';
    }
  }
  
  // Check emotional beats
  for (const beat of analysis.emotional_beats) {
    if (wordIndex >= beat.start_index && wordIndex < beat.end_index) {
      return 'emotional-beat';
    }
  }
  
  // Default to concept
  return 'concept';
}
