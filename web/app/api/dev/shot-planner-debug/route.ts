/**
 * POST /api/dev/shot-planner-debug
 * ============================================================================
 * Admin-only streaming endpoint that runs the production shot-planning pipeline
 * (Scene Decomposer → Per-Scene Shot Planner → Assembly) synchronously and
 * emits Server-Sent Events for every LLM call's inputs and outputs.
 *
 * This gives the ShotPlannerDebugger UI full observability into:
 * - The exact system + user prompts sent to the LLM
 * - The raw LLM responses
 * - Per-scene and per-attempt breakdowns
 * - Assembly stats and the final ShotPlan
 *
 * ZERO impact on production — this endpoint is only callable by admins
 * and never invoked by the video creation wizard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  decomposeIntoScenes,
  buildContextFromManifest,
  type DebugCapture,
  type SceneDecompositionContext,
  type WordTimestamp,
} from '@/lib/av-script/scene-decomposer';
import { planAllSceneShots } from '@/lib/av-script/scene-shot-planner';
import { buildCreativeManifest } from '@/lib/services/manifest-builder';
import { generateWorkerPrompts } from '@/lib/services/prompt-generator';
import type { ProjectSettings } from '@/types/settings';


// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  /** The script text to plan shots for. */
  script: string;
  /** Optional word-level timestamps (from imported video). If absent, simulated. */
  wordTimestamps?: WordTimestamp[];
  /** media_project.id — loads full channel ProjectSettings and builds CreativeManifest */
  projectSettingsId?: string;
  /**
   * video_projects.id — when set, the route fetches real word_timestamps and
   * script_content from that video row, overriding the body `script` and
   * `wordTimestamps` fields with production-exact data.
   */
  importFromVideoId?: string;
  /** Manual creative context (used when no channel is loaded) */
  creativeContext?: SceneDecompositionContext;
  /**
   * Full VideoCreativeOverrides object — mirrors the closed-loop production route.
   * When provided alongside projectSettingsId, all fields override channel defaults
   * (visual style, LoRA, MG theme, media weighting, directing intent, etc.)
   */
  videoCreativeOverrides?: import('@/lib/types/closed-loop').VideoCreativeOverrides;
  /** @deprecated — pass videoCreativeOverrides.videoCreativePrompt instead */
  videoCreativePrompt?: string;
  /** @deprecated — pass videoCreativeOverrides.directingIntent instead */
  directingIntent?: string;
  /** Aspect ratio override (kept as top-level since it's a manifest-level field) */
  aspectRatio?: '16:9' | '9:16';
  /** Script metadata for buildCreativeManifest */
  scriptMeta?: {
    genre?: string;
    toneStyle?: string;
    targetAudience?: string;
    pov?: string;
    contentNiche?: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/** Simulate word timestamps at a fixed pace when real TTS timestamps aren't available. */
function simulateWordTimestamps(script: string, wordsPerSecond = 2.5): WordTimestamp[] {
  const words = script.trim().split(/\s+/).filter(Boolean);
  const secPerWord = 1 / wordsPerSecond;
  return words.map((word, i) => ({
    word,
    start_seconds: +(i * secPerWord).toFixed(3),
    end_seconds: +((i + 1) * secPerWord).toFixed(3),
  }));
}

/** Write a single SSE event to the stream. */
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  eventType: string,
  data: unknown
) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(payload));
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  // — Auth: require admin —
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check — is_admin lives on the 'users' table, not 'profiles'
  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await supabaseService
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  // — Parse body —
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let { script, wordTimestamps: providedTimestamps } = body;
  const { projectSettingsId, importFromVideoId,
    creativeContext: manualContext, videoCreativeOverrides,
    videoCreativePrompt, directingIntent,
    aspectRatio, scriptMeta } = body;

  // ── Import real word timestamps + script from an existing video project ──
  if (importFromVideoId) {
    console.log(`[ShotPlannerDebug] importFromVideoId=${importFromVideoId} — fetching video row`);
    const { data: videoRow, error: videoErr } = await supabaseService
      .from('video_projects')
      .select('script_content, metadata')
      .eq('id', importFromVideoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (videoErr) {
      console.error(`[ShotPlannerDebug] Failed to fetch video ${importFromVideoId}:`, videoErr);
      return NextResponse.json({ error: `Failed to fetch video: ${videoErr.message}` }, { status: 500 });
    }
    if (!videoRow) {
      return NextResponse.json({ error: `Video ${importFromVideoId} not found or not owned by you` }, { status: 404 });
    }

    const meta = (videoRow.metadata || {}) as Record<string, unknown>;
    const rawTimestamps = meta.word_timestamps;
    if (Array.isArray(rawTimestamps) && rawTimestamps.length > 0) {
      providedTimestamps = rawTimestamps as WordTimestamp[];
      console.log(`[ShotPlannerDebug] Loaded ${providedTimestamps.length} real word timestamps from video`);
    } else {
      console.warn(`[ShotPlannerDebug] Video ${importFromVideoId} has no word_timestamps in metadata — will simulate`);
    }

    if (videoRow.script_content?.trim()) {
      script = videoRow.script_content;
      console.log(`[ShotPlannerDebug] Overriding script with video's script_content (${script.length} chars)`);
    } else {
      console.warn(`[ShotPlannerDebug] Video ${importFromVideoId} has no script_content — using body script`);
    }
  }

  if (!script?.trim()) {
    return NextResponse.json({ error: 'script is required' }, { status: 400 });
  }

  // — Build SSE stream —
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: unknown) => sendEvent(controller, encoder, type, data);

      try {
        // ══════════════════════════════════════════════════════════════════
        // PHASE 0: Build CreativeManifest & system prompt
        // ══════════════════════════════════════════════════════════════════
        let creativeContext: SceneDecompositionContext = manualContext || {};
        let shotPlannerSystemPrompt: string | undefined;
        let manifestSnapshot: Record<string, unknown> | null = null;

        if (projectSettingsId) {
          // Load full channel ProjectSettings
          const { data: settingsRow } = await supabaseService
            .from('project_settings')
            .select('settings')
            .eq('project_id', projectSettingsId)
            .maybeSingle();

          if (settingsRow?.settings) {
            const ps = settingsRow.settings as ProjectSettings;
            const channelDefaults = ps.visuals?.creativeDirection;

            // Merge full VideoCreativeOverrides object (Option B) with legacy individual fields
            const videoOverrides = {
              ...videoCreativeOverrides,
              // Individual fields as fallback for backward compat
              ...(videoCreativePrompt && !videoCreativeOverrides?.videoCreativePrompt
                ? { videoCreativePrompt } : {}),
              ...(directingIntent && !videoCreativeOverrides?.directingIntent
                ? { directingIntent } : {}),
            } as import('@/lib/types/closed-loop').VideoCreativeOverrides;

            const hasOverrides = Object.keys(videoOverrides ?? {}).length > 0;

            const basicInfoAspectRatio = aspectRatio || ps.basic_info?.aspectRatio;
            const resolvedScriptMeta = scriptMeta || {
              genre: ps.script?.genre,
              toneStyle: ps.script?.toneStyle,
              targetAudience: ps.script?.targetAudience,
              pov: ps.script?.pov,
              contentNiche: ps.script?.contentNiche,
            };

            const manifest = buildCreativeManifest(
              projectSettingsId,
              undefined,
              channelDefaults,
              hasOverrides ? videoOverrides : undefined,
              ps.visuals,
              basicInfoAspectRatio,
              resolvedScriptMeta,
            );

            creativeContext = buildContextFromManifest(manifest);
            const workerPrompts = generateWorkerPrompts(undefined, manifest, []);
            shotPlannerSystemPrompt = workerPrompts.shot_planner;

            manifestSnapshot = {
              visual_style: manifest.style.visual_style,
              aspect_ratio: manifest.style.aspect_ratio,
              color_palette: manifest.style.color_palette,
              lighting_mood: manifest.style.lighting_mood,
              pacing_preset: manifest.editing?.pacing_preset,
              hook_duration_seconds: manifest.pacing_rules?.hook_duration_seconds,
              media_weighting: manifest.media_weighting,
              mg_theme: manifest.motion_graphics?.theme,
              mg_font: manifest.motion_graphics?.font_family,
              lora: manifest.lora?.name,
              format_profile: manifest.video_grammar_profile?.format_profile,
              master_creative_prompt: manifest.master_creative_prompt,
              worker_prompt_overrides: manifest.worker_prompt_overrides,
              genre: manifest.script_context?.genre,
              tone_style: manifest.script_context?.tone_style,
            };

            emit('step', {
              phase: 'config',
              type: 'manifest_resolved',
              manifest: manifestSnapshot,
              shotPlannerSystemPrompt,
            });
          }
        }

        if (!manifestSnapshot) {
          emit('step', {
            phase: 'config',
            type: 'manual_context',
            creativeContext,
          });
        }

        // ══════════════════════════════════════════════════════════════════
        // PHASE 1: Word timestamps
        // ══════════════════════════════════════════════════════════════════
        let wordTimestamps: WordTimestamp[];
        let timestampSource: 'provided' | 'simulated';

        if (providedTimestamps && providedTimestamps.length > 0) {
          wordTimestamps = providedTimestamps;
          timestampSource = 'provided';
        } else {
          wordTimestamps = simulateWordTimestamps(script);
          timestampSource = 'simulated';
        }

        const totalDurationSeconds = wordTimestamps.length > 0
          ? wordTimestamps[wordTimestamps.length - 1].end_seconds
          : 0;

        emit('step', {
          phase: 'timestamps',
          type: 'ready',
          source: timestampSource,
          wordCount: wordTimestamps.length,
          totalDurationSeconds,
        });

        // ══════════════════════════════════════════════════════════════════
        // PHASE 2: Scene Decomposition
        // ══════════════════════════════════════════════════════════════════
        emit('step', { phase: 'scene_decomposer', type: 'start' });

        const sceneDecomposerCapture: DebugCapture = {
          onSystemPrompt: (phase, attempt, prompt) => {
            emit('step', { phase, attempt, type: 'system_prompt', content: prompt });
          },
          onUserPrompt: (phase, attempt, prompt) => {
            emit('step', { phase, attempt, type: 'user_prompt', content: prompt });
          },
          onLLMResponse: (phase, attempt, response) => {
            emit('step', { phase, attempt, type: 'llm_response', content: response });
          },
          onError: (phase, attempt, error) => {
            emit('step', { phase, attempt, type: 'error', content: error });
          },
        };

        const scenes = await decomposeIntoScenes(
          user.id,
          script,
          wordTimestamps as { word: string; start_seconds: number; end_seconds: number }[],
          creativeContext,
          (msg) => emit('step', { phase: 'scene_decomposer', type: 'progress', content: msg }),
          sceneDecomposerCapture
        );

        if (!scenes) {
          emit('error', { phase: 'scene_decomposer', message: 'Scene decomposition failed after all retries' });
          controller.close();
          return;
        }

        emit('step', {
          phase: 'scene_decomposer',
          type: 'result',
          sceneCount: scenes.length,
          scenes: scenes.map(s => ({
            scene_id: s.scene_id,
            description: s.description,
            narrative_purpose: s.narrative_purpose,
            start_seconds: s.start_seconds,
            end_seconds: s.end_seconds,
            suggested_shot_count: s.suggested_shot_count,
            pacing_intent: s.pacing_intent,
            start_word_index: s.start_word_index,
            end_word_index: s.end_word_index,
          })),
        });

        // ══════════════════════════════════════════════════════════════════
        // PHASE 3: Per-Scene Shot Planning
        // ══════════════════════════════════════════════════════════════════
        emit('step', { phase: 'shot_planner', type: 'start', sceneCount: scenes.length });

        const shotPlannerCapture: DebugCapture = {
          onSystemPrompt: (phase, attempt, prompt) => {
            emit('step', { phase, attempt, type: 'system_prompt', content: prompt });
          },
          onUserPrompt: (phase, attempt, prompt) => {
            emit('step', { phase, attempt, type: 'user_prompt', content: prompt });
          },
          onLLMResponse: (phase, attempt, response) => {
            emit('step', { phase, attempt, type: 'llm_response', content: response });
          },
          onError: (phase, attempt, error) => {
            emit('step', { phase, attempt, type: 'error', content: error });
          },
        };

        const sceneResults = await planAllSceneShots(
          user.id,
          scenes,
          wordTimestamps as { word: string; start_seconds: number; end_seconds: number }[],
          shotPlannerSystemPrompt,
          (msg, sceneIdx) => {
            emit('step', { phase: 'shot_planner', type: 'progress', sceneIndex: sceneIdx, content: msg });
          },
          shotPlannerCapture
        );

        // ══════════════════════════════════════════════════════════════════
        // PHASE 4: Assembly
        // ══════════════════════════════════════════════════════════════════
        emit('step', { phase: 'assembly', type: 'start' });

        const allShots: unknown[] = [];
        let fallbackSceneCount = 0;
        let segmentIndex = 0;

        for (const { scene, shots } of sceneResults) {
          if (shots) {
            for (const shot of shots) {
              allShots.push({ ...shot, segment_index: segmentIndex++ });
            }
          } else {
            fallbackSceneCount++;
            segmentIndex += scene.suggested_shot_count;
          }
        }

        // Media type breakdown
        const mediaBreakdown: Record<string, number> = {};
        for (const shot of allShots as Array<{ media_type: string }>) {
          mediaBreakdown[shot.media_type] = (mediaBreakdown[shot.media_type] || 0) + 1;
        }

        emit('complete', {
          totalShots: allShots.length,
          totalScenes: scenes.length,
          fallbackSceneCount,
          totalDurationSeconds,
          mediaBreakdown,
          shots: allShots,
          scenes: scenes,
          manifestSnapshot,
          shotPlannerSystemPrompt,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit('error', { phase: 'unknown', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
