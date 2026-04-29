/**
 * Shot Planner Worker
 * ============================================================================
 * LLM-driven shot planning using scene decomposition + per-scene planning.
 *
 * Pipeline:
 *   1. Scene Decomposition (LLM) — script → scene boundaries with narrative purpose
 *   2. Per-Scene Shot Planning (LLM per scene) — each scene → individual shots
 *   3. Assembly — flatten all scene shots into a unified ShotPlan
 *   4. Persist — write to video_projects.metadata
 *
 * Uses strict JSON schema enforcement (constrained decoding) for guaranteed
 * valid output. Each LLM call has a 5-attempt retry strategy with model
 * upgrade before any fallback.
 *
 * Per-scene legacy fallback: If a single scene fails all 5 LLM attempts,
 * only that scene falls back to the old analyzer + segmenter pipeline.
 * All other scenes keep their full-quality LLM-planned shots.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus, type TaskLifecycleOwner } from '@/lib/queues/shared';
import { analyzeContentStructure, segmentTimeline } from '@/lib/av-script';
import { processInChunks } from '@/lib/av-script/chunked-processor';
import type { WordTimestamp } from '@/types/task';
import type { PlannedShot, ShotPlan } from '@/lib/types/closed-loop';
import { CostTracker } from '@/lib/queues/cost-tracker';
import {
  decomposeIntoScenes,
  buildContextFromManifest,
  type EnrichedScene,
  type SceneDecompositionContext,
  type WordTimestamp as SceneWordTimestamp,
} from '@/lib/av-script/scene-decomposer';
import {
  planAllSceneShots,
  type ThinEntityRoster,
} from '@/lib/av-script/scene-shot-planner';
import type { AssetRegistry, CharacterProfile, LocationProfile } from '@/lib/queues/writing/types';
import { listEntities } from '@/lib/services/gcm';
import { enrichShotPlan } from '@/lib/services/shot-plan-enrichment';
import {
  normalizePlannedShotForProduction,
  normalizeSegmentationTreatment,
} from '@/lib/services/production-lane-normalizer';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface ShotPlannerJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
  /** The locked script content */
  script: string;
  /** Word-level TTS timestamps */
  wordTimestamps: WordTimestamp[];
  /** Total audio duration in seconds */
  totalDurationSeconds: number;
  /** Creative manifest aspect ratio */
  aspectRatio?: '16:9' | '9:16';
  /** System prompt from the Orchestrator's Dynamic Prompt Generator */
  systemPrompt?: string;
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[ShotPlanner]';

function buildFallbackShotDefaults(): Pick<
  PlannedShot,
  'synthesis_mode' | 'continuity_level' | 'anchor_strategy' | 'render_strategy' | 'trim_priority'
> {
  return {
    synthesis_mode: 'T2V',
    continuity_level: 'fresh',
    anchor_strategy: 'fresh',
    render_strategy: 'ai_video',
    trim_priority: 'balanced',
  };
}

function resolveReviewMode(metadata: Record<string, unknown>): 'off' | 'sequence_preview' {
  const snakeCaseControls = (metadata.production_controls || {}) as Record<string, unknown>;
  const camelCaseControls = (metadata.productionControls || {}) as Record<string, unknown>;
  const reviewMode =
    (snakeCaseControls.reviewMode as 'off' | 'sequence_preview' | undefined)
    || (camelCaseControls.reviewMode as 'off' | 'sequence_preview' | undefined);

  return reviewMode || 'off';
}

export const shotPlannerProcessor: Processor<ShotPlannerJobData> = async (
  job: Job<ShotPlannerJobData>
) => {
  const { taskId, userId, videoId, script, wordTimestamps, totalDurationSeconds } = job.data;
  const isClosedLoop = job.data.taskLifecycleOwner === 'orchestrator' || job.name.startsWith('closed-loop-');

  console.log(`${LOG_PREFIX} Starting for video ${videoId} (${wordTimestamps.length} words, ${totalDurationSeconds}s)${isClosedLoop ? ' (closed-loop)' : ''}`);

  const costTracker = new CostTracker(3, userId); // Step 3 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // Fetch outline assets and creative manifest from metadata
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata, project_id, creative_manifest')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;
      const projectId = video?.project_id as string | undefined;

      // Build creative context for scene decomposition
      const creativeManifest = (video?.creative_manifest as Record<string, unknown> | undefined)
        || (metadata.creative_manifest as Record<string, unknown> | undefined);
      let creativeContext: SceneDecompositionContext = {};
      if (creativeManifest) {
        try {
          const { CreativeManifest: CMSchema } = await import('@/lib/types/closed-loop');
          const parsed = CMSchema.safeParse(creativeManifest);
          if (parsed.success) {
            creativeContext = buildContextFromManifest(parsed.data);
          }
        } catch {
          // Use empty context if manifest can't be parsed
        }
      }

      // Build thin entity roster for the shot planner from outline_assets.
      // Characters: name + role only (physical details belong in prompt-gen's Visual Bible).
      // Locations: name, type, scale, essence, lighting.mood only (drives framing decisions).
      // Objects: omitted — they don't influence shot structure.
      const outlineAssetsRaw = metadata.outline_assets as AssetRegistry | undefined;
      const entityRoster: ThinEntityRoster | undefined = outlineAssetsRaw ? {
        characters: (outlineAssetsRaw.characters || []).map((c: CharacterProfile) => ({
          name: c.name,
          role: c.role,
        })),
        locations: (outlineAssetsRaw.locations || []).map((l: LocationProfile) => ({
          name: l.name,
          type: l.type,
          scale: l.scale,
          essence: l.essence,
          lightingMood: l.lighting?.mood,
        })),
      } : undefined;

      // Add aspect ratio from job data
      if (job.data.aspectRatio) {
        creativeContext.aspectRatio = job.data.aspectRatio;
      }

      // Cast word timestamps to the scene decomposer's expected format
      const sceneWordTimestamps: SceneWordTimestamp[] = wordTimestamps.map(w => ({
        word: w.word,
        start_seconds: w.start_seconds,
        end_seconds: w.end_seconds,
      }));

      // =====================================================================
      // STEP 1: LLM Scene Decomposition
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: LLM Scene Decomposition...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Analyzing script structure with AI...',
          progress_percent: 10,
        });
      }

      const scenes = await decomposeIntoScenes(
        userId,
        script,
        sceneWordTimestamps,
        creativeContext,
        (msg) => console.log(`${LOG_PREFIX} ${msg}`)
      );

      // If scene decomposition completely fails, fall back to legacy pipeline
      if (!scenes) {
        console.warn(`${LOG_PREFIX} ⚠️ Scene decomposition failed — falling back to legacy pipeline`);
        return runLegacyPipeline(
          job.data,
          metadata,
          supabase,
          isClosedLoop,
          totalDurationSeconds,
          costTracker
        );
      }

      console.log(`${LOG_PREFIX} Decomposed into ${scenes.length} scenes`);

      // =====================================================================
      // STEP 2: Per-Scene Shot Planning
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Per-Scene Shot Planning...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: `Planning shots for ${scenes.length} scenes...`,
          progress_percent: 30,
        });
      }

      // Use the orchestrator's system prompt for the per-scene planner
      const orchestratorPrompt = job.data.systemPrompt;

      const sceneResults = await planAllSceneShots(
        userId,
        scenes,
        sceneWordTimestamps,
        orchestratorPrompt,
        (msg, sceneIdx) => {
          console.log(`${LOG_PREFIX} ${msg}`);
          if (!isClosedLoop) {
            const pct = 30 + Math.round((sceneIdx / scenes.length) * 45);
            updateTaskStatus(taskId, {
              status: 'running',
              current_step: msg,
              progress_percent: pct,
            }).catch(() => {});
          }
        },
        undefined, // debugCapture — not used in production
        entityRoster,
      );

      // =====================================================================
      // STEP 3: Handle per-scene fallbacks + Assembly
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Assembling shot plan...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Assembling final shot plan...',
          progress_percent: 80,
        });
      }

      const allShots: PlannedShot[] = [];
      let segmentIndex = 0;
      let fallbackSceneCount = 0;
      const fallbackSceneIds: string[] = [];

      for (const { scene, shots } of sceneResults) {
        if (shots) {
          // LLM-planned shots — convert to PlannedShot
          for (const shot of shots) {
            const normalizedShot = normalizePlannedShotForProduction({
              segment_index: segmentIndex++,
              start_seconds: shot.start_seconds,
              end_seconds: shot.end_seconds,
              duration_seconds: shot.duration_seconds,
              text: shot.text,
              summary: shot.summary,
              content_type: shot.content_type,
              media_type: shot.media_type as PlannedShot['media_type'],
              synthesis_mode: shot.synthesis_mode as PlannedShot['synthesis_mode'],
              entity_refs: [],
              visual_elements: shot.visual_elements,
              visual_description: shot.visual_description,
              shot_role: shot.shot_role,
              framing: shot.framing,
              camera_angle: shot.camera_angle,
              camera_motion: shot.camera_motion,
              lens_style: shot.lens_style,
              subject_focus: shot.subject_focus,
              entry_transition_intent: shot.entry_transition_intent,
              exit_transition_intent: shot.exit_transition_intent,
              bridge_subject: shot.bridge_subject,
              visual_motif: shot.visual_motif,
              visual_treatment: shot.visual_treatment,
              continuity_level: shot.continuity_level || (shot.continuity_from_previous ? 'soft' : 'fresh'),
              anchor_strategy: shot.anchor_strategy,
              render_strategy: shot.render_strategy,
              trim_priority: shot.trim_priority || 'balanced',
              segmentation_treatment: normalizeSegmentationTreatment(shot.segmentation_treatment, {
                subjectFocus: shot.subject_focus,
                notes: shot.summary,
              }),
              stock_worthy: shot.stock_worthy,
              stock_search_query: shot.stock_search_query,
              sound_effects: shot.sound_effects.map(sfx => ({
                type: sfx.type,
                description: sfx.description,
                trigger_at_seconds: sfx.trigger_at_seconds,
                anchor_word: sfx.anchor_word,
              })),
              image_count: shot.image_count,
              mg_mode: shot.mg_mode,
              template_type: shot.template_type,
              scene_id: shot.scene_id,
              narrative_beat: shot.narrative_beat as PlannedShot['narrative_beat'],
              continuity_from_previous: shot.continuity_from_previous,
              angle_change: shot.angle_change,
              image_edit_instruction: shot.image_edit_instruction,
              persistent_graphic_id: shot.persistent_graphic_id,
              persistent_graphic_type: shot.persistent_graphic_type,
              graphic_state_patch: shot.graphic_state_patch,
            });
            allShots.push(normalizedShot);
          }
        } else {
          // Per-scene legacy fallback — only for this one failing scene
          fallbackSceneCount++;
          fallbackSceneIds.push(scene.scene_id);
          console.warn(
            `${LOG_PREFIX} ⚠️ Scene "${scene.scene_id}" using legacy fallback ` +
            `(words ${scene.start_word_index}-${scene.end_word_index})`
          );

          const fallbackShots = generateLegacyFallbackForScene(
            scene,
            sceneWordTimestamps,
            segmentIndex
          );

          for (const shot of fallbackShots) {
            allShots.push(shot);
            segmentIndex++;
          }
        }
      }

      if (fallbackSceneCount > 0) {
        console.warn(
          `${LOG_PREFIX} ⚠️ ${fallbackSceneCount}/${scenes.length} scenes used legacy fallback`
        );
      }

      // Post-processing: very short MG shots (<1.5s) converted to video
      let mgOverrideCount = 0;
      for (const shot of allShots) {
        if (shot.media_type === 'motiongraphic' && shot.duration_seconds < 1.5) {
          shot.media_type = 'video';
          mgOverrideCount++;
        }
      }
      if (mgOverrideCount > 0) {
        console.log(`${LOG_PREFIX} Overrode ${mgOverrideCount} trivially short MG shots to video`);
      }

      const projectEntities = projectId ? await listEntities(projectId) : [];
      const enrichment = enrichShotPlan(allShots, projectEntities, {
        fallbackSceneCount,
        fallbackSceneIds,
      });
      const enrichedShots = enrichment.shots;

      // Compute breakdowns
      const mediaBreakdown: Record<string, number> = {};
      const contentBreakdown: Record<string, number> = {};
      for (const shot of enrichedShots) {
        mediaBreakdown[shot.media_type] = (mediaBreakdown[shot.media_type] || 0) + 1;
        contentBreakdown[shot.content_type] = (contentBreakdown[shot.content_type] || 0) + 1;
      }

      const shotPlan: ShotPlan = {
        shots: enrichedShots,
        metadata: {
          total_segments: enrichedShots.length,
          total_duration_seconds: totalDurationSeconds,
          average_segment_duration: totalDurationSeconds / Math.max(1, enrichedShots.length),
          content_type_breakdown: contentBreakdown,
          media_type_breakdown: mediaBreakdown,
          scene_count: scenes.length,
          scene_breakdown: scenes.map(s => ({
            scene_id: s.scene_id,
            shot_count: enrichedShots.filter(shot => shot.scene_id === s.scene_id).length,
            start_seconds: s.start_seconds,
            end_seconds: s.end_seconds,
            description: s.description,
          })),
          planner_diagnostics: enrichment.diagnostics,
          sequence_plan: enrichment.sequencePlan,
          continuity_anchors: enrichment.continuityAnchors,
          transition_palette: enrichment.transitionPalette,
          planner_scores: enrichment.plannerScores,
          review_state: {
            review_mode: resolveReviewMode(metadata),
            status: resolveReviewMode(metadata) === 'sequence_preview' ? 'pending' : 'not_requested',
          },
          assembly_contract: enrichment.assemblyContract,
        },
      };

      // =====================================================================
      // STEP 4: Persist to metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 4: Persisting shot plan to metadata...`);

      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          shot_plan: shotPlan,
          // Keep backward-compat av_script_part1 format
          av_script_part1: {
            shots: enrichedShots,
          },
        },
      });
      await supabase
        .from('video_projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', videoId);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: `Shot plan complete: ${enrichedShots.length} shots across ${scenes.length} scenes`,
          progress_percent: 100,
        });
      }

      console.log(
        `${LOG_PREFIX} ✅ Complete: ${enrichedShots.length} shots across ${scenes.length} scenes ` +
        `(${fallbackSceneCount} legacy fallbacks)`
      );

      return {
        success: true,
        videoId,
        output: shotPlan,
      };
    }); // end costTracker.run

    await costTracker.save(videoId);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Failed for video ${videoId}:`, error);

    await costTracker.save(videoId);

    if (!isClosedLoop) {
      await updateTaskStatus(taskId, {
        status: 'failed',
        current_step: 'Shot planning failed',
        progress_percent: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
};

// ============================================================================
// LEGACY FALLBACK — Per-Scene
// ============================================================================

/**
 * Generate shots for a single failed scene using the old analyzer + segmenter.
 * This is the absolute last resort — only used after 5 LLM attempts have failed.
 */
function generateLegacyFallbackForScene(
  scene: EnrichedScene,
  wordTimestamps: SceneWordTimestamp[],
  segmentIndexStart: number
): PlannedShot[] {
  try {
    // Extract just the word timestamps for this scene's range
    const sceneWords = wordTimestamps.slice(
      scene.start_word_index,
      scene.end_word_index + 1
    );

    if (sceneWords.length === 0) {
      return [{
        segment_index: segmentIndexStart,
        start_seconds: scene.start_seconds,
        end_seconds: scene.end_seconds,
        duration_seconds: scene.end_seconds - scene.start_seconds,
        text: scene.text,
        summary: scene.description,
        content_type: 'concept',
        media_type: 'video',
        entity_refs: [],
        visual_elements: [],
        stock_worthy: false,
        sound_effects: [],
        image_count: 1,
        scene_id: scene.scene_id,
        narrative_beat: 'establishing',
        continuity_from_previous: false,
        ...buildFallbackShotDefaults(),
      }];
    }

    // Use the old analyzer on this scene's text
    const sceneScript = sceneWords.map(w => w.word).join(' ');
    const analysis = analyzeContentStructure(sceneScript, sceneWords as any);

    // Use the old segmenter on this scene's timestamps
    const segments = segmentTimeline(sceneWords as any, analysis);

    // Convert to PlannedShot with scene metadata
    return segments.map((seg, i): PlannedShot => ({
      segment_index: segmentIndexStart + i,
      start_seconds: seg.start_seconds,
      end_seconds: seg.end_seconds,
      duration_seconds: seg.end_seconds - seg.start_seconds,
      text: seg.text || '',
      summary: seg.text?.substring(0, 100) || '',
      content_type: seg.content_type || 'concept',
      media_type: 'video',
      entity_refs: [],
      visual_elements: [],
      stock_worthy: false,
      sound_effects: [],
      image_count: 1,
      scene_id: scene.scene_id,
      narrative_beat: 'establishing',
      continuity_from_previous: false,
      ...buildFallbackShotDefaults(),
    }));
  } catch (err) {
    console.error(`${LOG_PREFIX} Legacy fallback also failed for scene "${scene.scene_id}":`, err);

    // Absolute last fallback: single shot covering the entire scene
    return [{
      segment_index: segmentIndexStart,
      start_seconds: scene.start_seconds,
      end_seconds: scene.end_seconds,
      duration_seconds: scene.end_seconds - scene.start_seconds,
      text: scene.text,
      summary: scene.description,
      content_type: 'concept',
      media_type: 'video',
      entity_refs: [],
      visual_elements: [],
      stock_worthy: false,
      sound_effects: [],
      image_count: 1,
      scene_id: scene.scene_id,
      narrative_beat: 'establishing',
      continuity_from_previous: false,
      ...buildFallbackShotDefaults(),
    }];
  }
}

// ============================================================================
// LEGACY PIPELINE — Full fallback (only if scene decomposition itself fails)
// ============================================================================

/**
 * Run the entire old pipeline. Only called if scene decomposition
 * completely fails after 5 attempts.
 */
async function runLegacyPipeline(
  jobData: ShotPlannerJobData,
  metadata: Record<string, unknown>,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  isClosedLoop: boolean,
  totalDurationSeconds: number,
  _costTracker: CostTracker
): Promise<Record<string, unknown>> {
  const { taskId, userId, script, wordTimestamps, videoId } = jobData;

  console.warn(`${LOG_PREFIX} Running FULL legacy pipeline (analyzer → segmenter → chunked-processor)`);

  // Step 1: Content analysis (keyword-based)
  const analysis = analyzeContentStructure(script, wordTimestamps);

  // Step 2: Timeline segmentation (rule-based)
  const segments = segmentTimeline(wordTimestamps, analysis);

  // Step 3: Chunked AI processing
  const outlineAssets = metadata.outline_assets || {};
  const shotSummaries = await processInChunks(
    userId,
    segments,
    outlineAssets,
    undefined,
    async (progress: number, step: string) => {
      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: `[Legacy] ${step}`,
          progress_percent: 40 + Math.round(progress * 0.4),
        });
      }
    }
  );

  // Step 4: Build ShotPlan
  const plannedShots: PlannedShot[] = shotSummaries.map((shot, idx) => ({
    segment_index: shot.segment_index ?? idx,
    start_seconds: shot.start_seconds,
    end_seconds: shot.end_seconds,
    duration_seconds: shot.duration_seconds,
    text: shot.text || '',
    summary: shot.summary || '',
    content_type: shot.content_type || 'concept',
    media_type: (shot.media_type as PlannedShot['media_type']) || 'video',
    entity_refs: [],
    visual_elements: (shot.visual_elements || []) as string[],
    visual_description: shot.visual_description,
    stock_worthy: shot.stock_worthy ?? false,
    stock_search_query: shot.stock_search_query,
    sound_effects: (shot.sound_effects || []).map(sfx => ({
      type: sfx.type,
      description: sfx.description,
      trigger_at_seconds: sfx.trigger_at_seconds,
      anchor_word: sfx.anchor_word,
    })),
    image_count: shot.image_count ?? 1,
    continuity_from_previous: false,
    ...buildFallbackShotDefaults(),
  }));

  // MG override
  for (const shot of plannedShots) {
    if (shot.media_type === 'motiongraphic' && shot.duration_seconds < 1.5) {
      shot.media_type = 'video';
    }
  }

  const mediaBreakdown: Record<string, number> = {};
  const contentBreakdown: Record<string, number> = {};
  const projectId = ((metadata.creative_manifest as Record<string, unknown> | undefined)?.project_id as string | undefined);
  const projectEntities = projectId ? await listEntities(projectId) : [];
  const enrichment = enrichShotPlan(plannedShots, projectEntities, {
    fallbackSceneCount: 0,
    fallbackSceneIds: [],
  });
  const enrichedShots = enrichment.shots;

  for (const shot of enrichedShots) {
    mediaBreakdown[shot.media_type] = (mediaBreakdown[shot.media_type] || 0) + 1;
    contentBreakdown[shot.content_type] = (contentBreakdown[shot.content_type] || 0) + 1;
  }

  const shotPlan: ShotPlan = {
    shots: enrichedShots,
    metadata: {
      total_segments: enrichedShots.length,
      total_duration_seconds: totalDurationSeconds,
      average_segment_duration: totalDurationSeconds / Math.max(1, enrichedShots.length),
      content_type_breakdown: contentBreakdown,
      media_type_breakdown: mediaBreakdown,
      planner_diagnostics: {
        ...enrichment.diagnostics,
        fallback_scene_count: 1,
        fallback_scene_ids: ['legacy-full-fallback'],
      },
    },
  };

  await supabase.rpc('merge_video_metadata', {
    p_video_id: videoId,
    p_updates: {
      shot_plan: shotPlan,
      av_script_part1: { shots: enrichedShots, analysis },
    },
  });

  await supabase
    .from('video_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', videoId);

  if (!isClosedLoop) {
    await updateTaskStatus(taskId, {
      status: 'completed',
      current_step: `[Legacy] Shot plan complete: ${plannedShots.length} shots`,
      progress_percent: 100,
    });
  }

  return {
    success: true,
    videoId,
    output: shotPlan,
  };
}
