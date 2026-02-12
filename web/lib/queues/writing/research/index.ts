/**
 * Research Module - Main Orchestrator
 * ============================================================================
 * Coordinates the research phase of the universal script generation system.
 * Supports both OpenRouter web search and Valyu AI research providers.
 */


import type { 
  ResearchDossier, 
  ScriptGenre, 
  ResearchToggle,
} from '../types';
import { GENRE_CONFIG } from '../config';

import { decomposeTopicIntoQuestions } from './topic-decomposition';
import { extractAndVerifyFacts } from './fact-extraction';
import { assembleDossier } from './dossier';
import { performValyuResearch } from './valyu-research-provider';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchResult {
  /** Whether research was performed */
  performed: boolean;
  /** The complete research dossier (if performed) */
  dossier: ResearchDossier | null;
  /** Reason if research was skipped */
  skipReason?: string;
}

export interface ResearchOptions {
  /** User ID for API calls */
  userId: string;
  /** Topic to research */
  topic: string;
  /** Script genre */
  genre: ScriptGenre;
  /** Research toggle setting */
  researchToggle: ResearchToggle;
  /** Optional additional context/angle */
  angle?: string;
  /** Optional source preferences */
  sourcePreferences?: string;
  /** Use Valyu AI instead of OpenRouter for research */
  useValyu?: boolean;
  /** Progress callback for long-running Valyu research */
  onProgress?: (status: string, elapsedMs: number) => void;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Determines whether research should be executed based on settings and genre.
 */
export function shouldExecuteResearch(
  genre: ScriptGenre,
  researchToggle: ResearchToggle
): { execute: boolean; reason: string; isDeep?: boolean } {
  // Research toggle OFF always skips
  if (researchToggle === 'off') {
    return { 
      execute: false, 
      reason: 'Research toggle is set to OFF' 
    };
  }

  // Pure fiction genres skip research unless explicitly enabled
  const genreConfig = GENRE_CONFIG[genre];
  
  if (!genreConfig.allowsResearch) {
    return { 
      execute: false, 
      reason: `Genre "${genre}" does not support research` 
    };
  }

  // Full research - maximum information extraction (acts as deep research)
  if (researchToggle === 'full') {
    return { 
      execute: true, 
      reason: 'Full research with maximum information extraction',
      isDeep: true,
    };
  }

  return { execute: false, reason: 'No research needed' };
}

/**
 * Execute the complete research phase.
 * 
 * This is the main entry point for the research module.
 * It coordinates:
 * 1. Topic decomposition into researchable questions
 * 2. Web search and fact extraction (via OpenRouter or Valyu)
 * 3. Fact verification and confidence scoring
 * 4. Dossier assembly
 */
export async function executeResearchPhase(
  options: ResearchOptions
): Promise<ResearchResult> {
  const { 
    userId, 
    topic, 
    genre, 
    researchToggle, 
    angle, 
    sourcePreferences,
    useValyu = false,
    onProgress,
  } = options;

  // Check if research should be executed
  const researchDecision = shouldExecuteResearch(genre, researchToggle);
  
  if (!researchDecision.execute) {
    return {
      performed: false,
      dossier: null,
      skipReason: researchDecision.reason,
    };
  }

  console.log(`[Research] Starting research phase for topic: ${topic.substring(0, 50)}...`);
  console.log(`[Research] Reason: ${researchDecision.reason}`);
  console.log(`[Research] Provider: ${useValyu ? 'Valyu AI' : 'OpenRouter'}`);
  
  const isDeepResearch = researchDecision.isDeep === true;
  if (isDeepResearch) {
    console.log('[Research] DEEP MODE: Maximum information extraction for current events');
  }

  try {
    // Step 1: Decompose topic into researchable questions
    // Skip for Valyu DeepResearch - it handles decomposition internally with chain-of-thought
    let questions: Awaited<ReturnType<typeof decomposeTopicIntoQuestions>> = [];
    
    if (useValyu && isDeepResearch) {
      console.log('[Research] Step 1: Skipping decomposition - DeepResearch handles internally');
    } else {
      console.log('[Research] Step 1: Decomposing topic into questions...');
      questions = await decomposeTopicIntoQuestions(userId, topic, angle, isDeepResearch, useValyu);
      console.log(`[Research] Generated ${questions.length} research questions`);
    }

    // Step 2: Execute research and extract facts
    console.log('[Research] Step 2: Executing web search and extracting facts...');
    
    let extractedFacts;
    
    if (useValyu && researchToggle !== 'off') {
      // Use Valyu AI for research
      console.log('[Research] Using Valyu AI research provider...');
      extractedFacts = await performValyuResearch({
        userId,
        topic,
        questions,
        researchToggle: researchToggle as 'full',
        sourcePreferences,
        onProgress,
      });
    } else {
      // Use OpenRouter web search (original path)
      extractedFacts = await extractAndVerifyFacts(
        userId,
        topic,
        questions,
        { isDeepResearch, sourcePreferences }
      );
    }
    
    console.log(`[Research] Extracted ${extractedFacts.facts.length} facts, ${extractedFacts.quotes.length} quotes`);

    // Step 3: Assemble the research dossier
    console.log('[Research] Step 3: Assembling research dossier...');
    const dossier = await assembleDossier(
      userId,
      topic,
      researchToggle,
      extractedFacts
    );
    console.log(`[Research] Dossier complete. Confidence: ${dossier.metadata.overallConfidence}%`);

    return {
      performed: true,
      dossier,
    };

  } catch (error) {
    console.error('[Research] Error during research phase:', error);
    throw error;
  }
}
