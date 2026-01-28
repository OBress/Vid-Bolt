/**
 * Research Comparison API Route
 * ============================================================================
 * Runs both legacy (OpenRouter) and Valyu research providers in parallel
 * for side-by-side comparison in the Universal Script Tester.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { executeResearchPhase } from '@/lib/queues/writing/research';
import { decomposeTopicIntoQuestions } from '@/lib/queues/writing/research/topic-decomposition';
import type { ScriptGenre, ResearchToggle } from '@/lib/queues/writing/types';

export const maxDuration = 300; // 5 minutes max for this endpoint

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      topic,
      genre = 'documentary',
      researchToggle = 'full',
      angle,
      sourcePreferences,
    } = body;

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic is required' },
        { status: 400 }
      );
    }

    console.log('[ResearchCompare] Starting comparison research');
    console.log(`[ResearchCompare] Topic: "${topic.substring(0, 50)}..."`);
    console.log(`[ResearchCompare] Toggle: ${researchToggle}`);

    // Generate questions once (shared by both providers)
    const isDeepResearch = researchToggle === 'deep';
    const questions = await decomposeTopicIntoQuestions(
      user.id, 
      topic, 
      angle, 
      isDeepResearch
    );
    console.log(`[ResearchCompare] Generated ${questions.length} questions`);

    // Run both providers in parallel
    const startTime = Date.now();

    const [legacyResult, valyuResult] = await Promise.allSettled([
      // Legacy - OpenRouter
      (async () => {
        const legacyStart = Date.now();
        console.log('[ResearchCompare] Starting Legacy (OpenRouter)...');
        const result = await executeResearchPhase({
          userId: user.id,
          topic,
          genre: genre as ScriptGenre,
          researchToggle: researchToggle as ResearchToggle,
          angle,
          sourcePreferences,
          useValyu: false, // Legacy path
        });
        const legacyDuration = Date.now() - legacyStart;
        console.log(`[ResearchCompare] Legacy completed in ${legacyDuration}ms`);
        return { ...result, durationMs: legacyDuration };
      })(),

      // Valyu - New provider
      (async () => {
        const valyuStart = Date.now();
        console.log('[ResearchCompare] Starting Valyu...');
        const result = await executeResearchPhase({
          userId: user.id,
          topic,
          genre: genre as ScriptGenre,
          researchToggle: researchToggle as ResearchToggle,
          angle,
          sourcePreferences,
          useValyu: true, // Valyu path
        });
        const valyuDuration = Date.now() - valyuStart;
        console.log(`[ResearchCompare] Valyu completed in ${valyuDuration}ms`);
        return { ...result, durationMs: valyuDuration };
      })(),
    ]);

    const totalDuration = Date.now() - startTime;
    console.log(`[ResearchCompare] Total comparison time: ${totalDuration}ms`);

    // Build comparison response
    const comparison = {
      topic,
      researchToggle,
      questionsCount: questions.length,
      totalDurationMs: totalDuration,

      legacy: legacyResult.status === 'fulfilled' 
        ? {
            success: true,
            performed: legacyResult.value.performed,
            durationMs: legacyResult.value.durationMs,
            dossier: legacyResult.value.dossier,
            metrics: legacyResult.value.dossier ? {
              factCount: legacyResult.value.dossier.facts?.length || 0,
              quoteCount: legacyResult.value.dossier.quotes?.length || 0,
              entityCount: legacyResult.value.dossier.entities?.length || 0,
              sourceCount: legacyResult.value.dossier.worksCited?.length || 0,
              confidence: legacyResult.value.dossier.metadata?.overallConfidence || 0,
            } : null,
          }
        : {
            success: false,
            error: legacyResult.reason?.message || 'Legacy research failed',
            durationMs: 0,
            dossier: null,
            metrics: null,
          },

      valyu: valyuResult.status === 'fulfilled'
        ? {
            success: true,
            performed: valyuResult.value.performed,
            durationMs: valyuResult.value.durationMs,
            dossier: valyuResult.value.dossier,
            metrics: valyuResult.value.dossier ? {
              factCount: valyuResult.value.dossier.facts?.length || 0,
              quoteCount: valyuResult.value.dossier.quotes?.length || 0,
              entityCount: valyuResult.value.dossier.entities?.length || 0,
              sourceCount: valyuResult.value.dossier.worksCited?.length || 0,
              sourceDocumentCount: valyuResult.value.dossier.sourceDocuments?.length || 0,
              confidence: valyuResult.value.dossier.metadata?.overallConfidence || 0,
            } : null,
          }
        : {
            success: false,
            error: valyuResult.reason?.message || 'Valyu research failed',
            durationMs: 0,
            dossier: null,
            metrics: null,
          },
    };

    return NextResponse.json(comparison);

  } catch (error) {
    console.error('[ResearchCompare] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Comparison failed' },
      { status: 500 }
    );
  }
}
