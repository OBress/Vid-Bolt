/**
 * Research Compare Worker
 * ============================================================================
 * BullMQ worker for running research comparisons in the dev tools.
 * Handles long-running DeepResearch calls (5-10 min) outside of API routes.
 * 
 * Now also generates full outline output:
 * 1. Research (Valyu DeepResearch only)
 * 2. Content Scoping (dynamic duration)
 * 3. Spine Generation (video outline with beats)
 * 4. Asset Registry (character/location/object profiles)
 */

import { Processor } from 'bullmq';
import { executeResearchPhase } from '../writing/research';
import { executeScopingPhase, quickScoping } from '../writing/scoping';
import { generateSpine } from '../writing/spine';
import { generateAssetRegistry } from '../writing/assets';
import type { 
  ScriptGenre, 
  ResearchToggle, 
  ResearchDossier,
  DurationRange,
  Spine,
  AssetRegistry,
  DurationDecision,
} from '../writing/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchCompareInput {
  userId: string;
  topic: string;
  genre: ScriptGenre;
  researchToggle: ResearchToggle;
  angle?: string;
  sourcePreferences?: string;
  researchProvider: 'valyu' | 'openrouter';
  /** Duration range for spine generation */
  durationRange?: DurationRange;
}

export interface ResearchCompareOutput {
  success: boolean;
  dossier: ResearchDossier | null;
  durationMs: number;
  metrics: {
    factCount: number;
    quoteCount: number;
    entityCount: number;
    sourceCount: number;
    sourceDocumentCount: number;
    confidence: number;
    // v2 specific
    hasNarrative: boolean;
    keyDevelopmentCount: number;
    entitiesV2Count: number;
  } | null;
  error?: string;
  /** Full outline output (spine, assets, etc.) */
  outline?: {
    durationDecision: DurationDecision;
    spine: Spine;
    assetRegistry: AssetRegistry;
  };
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const researchCompareProcessor: Processor<ResearchCompareInput, ResearchCompareOutput> = async (job) => {
  const { userId, topic, genre, researchToggle, angle, sourcePreferences, researchProvider, durationRange } = job.data;
  
  // FORCE VALYU ONLY - no OpenRouter web search
  const useValyu = true;
  const providerName = 'Valyu';
  
  console.log('[ResearchCompare] Starting research job', job.id);
  console.log(`[ResearchCompare] Topic: "${topic.substring(0, 50)}..."`);
  console.log(`[ResearchCompare] Provider: ${providerName}, Toggle: ${researchToggle}`);
  if (durationRange) {
    console.log(`[ResearchCompare] Duration range: ${durationRange.minMinutes}-${durationRange.maxMinutes} min`);
  }
  
  const startTime = Date.now();
  
  try {
    // =========================================================================
    // PHASE 1: RESEARCH
    // =========================================================================
    console.log('[ResearchCompare] Phase 1: Research...');
    const result = await executeResearchPhase({
      userId,
      topic,
      genre,
      researchToggle,
      angle,
      sourcePreferences,
      useValyu,
    });
    
    console.log(`[ResearchCompare] Research completed in ${Date.now() - startTime}ms`);
    
    // Build metrics from dossier
    const dossier = result.dossier;
    const metrics = dossier ? {
      factCount: dossier.facts?.length || 0,
      quoteCount: dossier.quotes?.length || 0,
      entityCount: dossier.entities?.length || 0,
      sourceCount: dossier.worksCited?.length || 0,
      sourceDocumentCount: (dossier as any).sourceDocuments?.length || 0,
      confidence: dossier.metadata?.overallConfidence || 0,
      // v2 specific
      hasNarrative: !!(dossier as any).narrative,
      keyDevelopmentCount: (dossier as any).keyDevelopments?.length || 0,
      entitiesV2Count: (dossier as any).entitiesV2?.length || 0,
    } : null;
    
    // If no durationRange provided, return research-only result
    if (!durationRange) {
      console.log('[ResearchCompare] No durationRange provided, returning research-only result');
      const durationMs = Date.now() - startTime;
      return {
        success: true,
        dossier: dossier || null,
        durationMs,
        metrics,
      };
    }
    
    // =========================================================================
    // PHASE 2: CONTENT SCOPING
    // =========================================================================
    console.log('[ResearchCompare] Phase 2: Content Scoping...');
    const scopingResult = await executeScopingPhase({
      dossier,
      durationRange,
      genre,
      topic,
    });
    console.log(`[ResearchCompare] Scoping completed - ${scopingResult.durationDecision.recommendedDurationSeconds}s recommended`);
    
    // =========================================================================
    // PHASE 3: SPINE GENERATION
    // =========================================================================
    console.log('[ResearchCompare] Phase 3: Spine Generation...');
    const spineResult = await generateSpine({
      userId,
      topic,
      genre,
      durationDecision: scopingResult.durationDecision,
      dossier,
      angle,
    });
    console.log(`[ResearchCompare] Spine completed - ${spineResult.spine.beatCount} beats`);
    
    // =========================================================================
    // PHASE 4: ASSET REGISTRY
    // =========================================================================
    console.log('[ResearchCompare] Phase 4: Asset Registry...');
    const assetResult = await generateAssetRegistry({
      userId,
      topic,
      genre,
      spine: spineResult.spine,
      dossier,
    });
    console.log(`[ResearchCompare] Assets completed - ${assetResult.stats.totalAssets} total assets`);
    
    const durationMs = Date.now() - startTime;
    console.log(`[ResearchCompare] Full pipeline completed in ${durationMs}ms`);
    
    return {
      success: true,
      dossier: dossier || null,
      durationMs,
      metrics,
      outline: {
        durationDecision: scopingResult.durationDecision,
        spine: spineResult.spine,
        assetRegistry: assetResult.registry,
      },
    };
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[ResearchCompare] Error:', error);
    
    return {
      success: false,
      dossier: null,
      durationMs,
      metrics: null,
      error: error instanceof Error ? error.message : 'Research failed',
    };
  }
};
