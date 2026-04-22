/**
 * Asset Scout Worker
 * ============================================================================
 * Specialized worker combining stock media search + AI prompt generation.
 * Refactored from av-script Part 2 + stock-media.ts.
 *
 * Input:  ShotPlan + GCM entities
 * Output: AssetManifest with stock URLs and AI visual prompts
 *
 * This worker:
 *   1. Classifies shots needing stock vs AI generation
 *   2. Searches Serper/Valyu for stock-worthy shots
 *   3. Crafts enriched AI prompts using GCM entity descriptions
 *   4. Returns a structured AssetManifest
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus, type TaskLifecycleOwner } from '@/lib/queues/shared';
import { processWithStockMedia } from '@/lib/av-script/stock-media-director';
import { getEntitiesByIds } from '@/lib/services/gcm';
import type { AssetEntry, AssetManifest, PlannedShot } from '@/lib/types/closed-loop';
import { CostTracker } from '@/lib/queues/cost-tracker';
import { getShotNeighborContext } from '@/lib/services/shot-context';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface AssetScoutJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
  /** System prompt from the Orchestrator's Dynamic Prompt Generator */
  systemPrompt?: string;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[AssetScout]';

function resolveAssetSource(shot: PlannedShot): AssetEntry['source'] {
  if (shot.render_strategy === 'segment_animate' || shot.render_strategy === 'segment_video_fx') {
    return 'ai_video';
  }
  switch (shot.visual_treatment) {
    case 'stock':
    case 'archival':
      return 'stock';
    case 'ai_image':
      return 'ai_image';
    case 'ai_video':
      return 'ai_video';
    case 'mg_template':
    case 'hybrid':
      return 'motiongraphic';
    default:
      if (shot.media_type === 'stock') return 'stock';
      if (shot.media_type === 'image') return 'ai_image';
      if (shot.media_type === 'video') return 'ai_video';
      return 'motiongraphic';
  }
}

function buildClusterPromptNote(shots: PlannedShot[], currentIndex: number): string {
  const shot = shots[currentIndex];
  if (!shot.scene_cluster_id) return '';

  const clusterShots = shots.filter(candidate => candidate.scene_cluster_id === shot.scene_cluster_id);
  if (clusterShots.length < 2) return '';

  const anchor = clusterShots[0];
  if (anchor.segment_index === shot.segment_index) {
    return 'This shot establishes a continuity cluster. Make the setting, character styling, and visual identity clear enough for follow-up shots to inherit.';
  }

  return [
    'This shot belongs to a continuity cluster.',
    `Match the established world of the anchor shot: "${anchor.visual_description || anchor.summary || anchor.text}".`,
    'Preserve the same setting, entity styling, lighting language, and visual identity while changing framing or action as needed.',
  ].join(' ');
}

function buildBreakdownPromptNote(shot: PlannedShot): string {
  if (!shot.breakdown_sequence_id || !shot.breakdown_role) return '';

  return [
    `This shot is part of connected breakdown sequence ${shot.breakdown_sequence_id}.`,
    `Its role is ${shot.breakdown_role}.`,
    'Preserve continuity with adjacent shots while changing the scale of explanation rather than inventing a new world.',
  ].join(' ');
}

// NOTE: buildDirectingPromptNote was removed.
// Directing metadata (shot_role, framing, camera_angle, camera_motion) is stored as
// structured fields on PlannedShot and consumed directly by enrichLtx2Prompt().
// Injecting them as label strings ("Shot role: X", "Framing: Y") into the visual
// prompt caused LTX 2.3 to hallucinate those labels as rendered on-screen text.

function buildSegmentationPromptNote(shot: PlannedShot): string {
  const treatment = shot.segmentation_treatment;
  if (!treatment?.execution_mode) return '';

  // Only inject natural-language behavioral directions — not label-style metadata.
  // Strings like "Preset: X" and "Segmentation prompt: Y" are technical identifiers
  // that LTX 2.3 will attempt to render as on-screen text. Behavioral instructions
  // (desaturation, zoom, annotation style) are safe because they read as scene direction.
  const parts = [
    treatment.allow_background_desaturation ? 'The background desaturates while the subject stays emphasized.' : '',
    treatment.allow_guided_zoom ? 'A guided zoom moves toward the segmented subject or detail.' : '',
    treatment.allow_tracked_annotation ? 'Use tracked annotation or highlight language rather than generic motion.' : '',
    treatment.notes || '',
  ].filter(Boolean);

  return parts.join(' ');
}

export const assetScoutProcessor: Processor<AssetScoutJobData> = async (
  job: Job<AssetScoutJobData>
) => {
  const { taskId, userId, videoId, aspectRatio: _aspectRatio } = job.data;
  const isClosedLoop = job.data.taskLifecycleOwner === 'orchestrator' || job.name.startsWith('closed-loop-');

  console.log(`${LOG_PREFIX} Starting for video ${videoId}${isClosedLoop ? ' (closed-loop)' : ''}`);

  const costTracker = new CostTracker(4, userId); // Step 4 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Fetch shot plan from metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Fetching shot plan...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Loading shot plan...',
          progress_percent: 5,
        });
      }

      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;
      const shotPlan = metadata.shot_plan as { shots: PlannedShot[] } | undefined;
      const shots = shotPlan?.shots || [];

      if (shots.length === 0) {
        // Fallback: try av_script_part1
        const avScriptPart1 = metadata.av_script_part1 as { shots?: PlannedShot[] } | undefined;
        if (avScriptPart1?.shots?.length) {
          shots.push(...avScriptPart1.shots);
        }
      }

      if (shots.length === 0) {
        console.warn(`${LOG_PREFIX} No shots found in metadata`);
        if (!isClosedLoop) {
          await updateTaskStatus(taskId, {
            status: 'completed',
            current_step: 'No shots to process',
            progress_percent: 100,
          });
        }
        return { success: true, videoId, output: { entries: [], metadata: { stock_count: 0, ai_image_count: 0, ai_video_count: 0, motiongraphic_count: 0, sfx_count: 0 } } };
      }

      console.log(`${LOG_PREFIX} Found ${shots.length} shots to process`);

      // =====================================================================
      // STEP 2: Fetch GCM entities for prompt enrichment
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Loading GCM entities...`);

      const allEntityRefs = [...new Set(shots.flatMap(s => s.entity_refs || []))];
      const entities = allEntityRefs.length > 0
        ? await getEntitiesByIds(allEntityRefs)
        : [];

      console.log(`${LOG_PREFIX} Loaded ${entities.length} GCM entities for enrichment`);

      // =====================================================================
      // STEP 2b: Stock media scraping for stock-worthy shots
      // =====================================================================
      const stockWorthyShots = shots.filter((s: any) => s.stock_worthy === true);
      const stockResults: Record<number, { url: string; description: string }> = {};

      if (stockWorthyShots.length > 0) {
        console.log(`${LOG_PREFIX} Step 2b: Scraping stock media for ${stockWorthyShots.length} stock-worthy shots...`);

        if (!isClosedLoop) {
          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: `Scraping stock media for ${stockWorthyShots.length} shots...`,
            progress_percent: 20,
          });
        }

        try {
          const enrichedShots = await processWithStockMedia(
            userId,
            videoId,
            shots as any, // PlannedShot → ShotPart1 compatible shape
            'standard_images',
            {
              videoTopic: (metadata.video_topic as string) || undefined,
              spineBeats: (metadata.spine_beats as string[]) || undefined,
            }
          );

          for (const shot of enrichedShots) {
            if (shot.stock_media_ref?.url) {
              stockResults[shot.segment_index] = {
                url: shot.stock_media_ref.url,
                description: shot.stock_media_ref.description || '',
              };
            }
          }

          console.log(`${LOG_PREFIX} Step 2b: Found ${Object.keys(stockResults).length} stock images`);
          costTracker.addSerperSearch(stockWorthyShots.length);
        } catch (err) {
          console.warn(`${LOG_PREFIX} Step 2b: Stock scraping failed, continuing without:`, err);
        }
      } else {
        console.log(`${LOG_PREFIX} Step 2b: No stock-worthy shots, skipping Serper scrape`);
      }

      // =====================================================================
      // STEP 3: Build asset entries for each shot
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Building asset manifest...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: `Processing ${shots.length} shots for asset retrieval...`,
          progress_percent: 30,
        });
      }

      const entries: AssetEntry[] = [];
      const resolvedPrompts: Record<string, string> = {};
      let stockCount = 0;
      let aiImageCount = 0;
      let aiVideoCount = 0;
      let mgCount = 0;
      let sfxCount = 0;

      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];

        // Build entity-enriched description
        const shotEntities = entities.filter(e =>
          shot.entity_refs?.includes(e.entity_id)
        );
        const entityContext = shotEntities.length > 0
          ? ` Featuring: ${shotEntities.map(e => `${e.name} (${e.text_description})`).join(', ')}.`
          : '';


        const enrichedPrompt = `${shot.visual_description || shot.summary || shot.text}${entityContext}`;


        // Neighbor context: inject awareness of surrounding shots' visual intent
        const neighborCtx = getShotNeighborContext(shots, i);
        const promptNotes = [
          neighborCtx.compactNote,
          buildClusterPromptNote(shots, i),
          buildBreakdownPromptNote(shot),
          // buildDirectingPromptNote removed — directing metadata is consumed by enrichLtx2Prompt
          buildSegmentationPromptNote(shot),
        ].filter(Boolean);
        const enrichedPromptWithContext = promptNotes.length > 0
          ? `${enrichedPrompt} [${promptNotes.join(' ')}]`
          : enrichedPrompt;


        const source = resolveAssetSource(shot);
        if (source === 'stock') {
          stockCount++;
        } else if (source === 'ai_image') {
          aiImageCount++;
        } else if (source === 'ai_video') {
          aiVideoCount++;
        } else {
          mgCount++;
        }

        // Count SFX
        const hasSfx = shot.sound_effects && shot.sound_effects.length > 0;
        if (hasSfx) sfxCount += shot.sound_effects.length;

        // Attach scraped stock media if available for this shot
        const stockMatch = stockResults[shot.segment_index];

        entries.push({
          segment_index: shot.segment_index,
          visual_prompt: enrichedPromptWithContext,
          source,
          render_strategy: shot.render_strategy,
          transition_notes: [
            shot.entry_transition_intent,
            shot.exit_transition_intent,
          ].filter((value): value is string => !!value),
          continuity_level: shot.continuity_level,
          shot_role: shot.shot_role,
          framing: shot.framing,
          camera_angle: shot.camera_angle,
          camera_motion: shot.camera_motion,
          visual_motif: shot.visual_motif,
          trim_priority: shot.trim_priority,
          segmentation_treatment: shot.segmentation_treatment,
          stock_url: stockMatch?.url,
          sfx: hasSfx ? {
            url: '', // Will be populated by SFX search
            description: shot.sound_effects[0].description,
            trigger_at_seconds: shot.sound_effects[0].trigger_at_seconds,
          } : undefined,
        });
        resolvedPrompts[`shot-${shot.segment_index}`] = enrichedPromptWithContext;

        // Progress update every 5 shots
        if (!isClosedLoop && i % 5 === 0) {
          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: `Processing shot ${i + 1}/${shots.length}...`,
            progress_percent: 30 + Math.round((i / shots.length) * 50),
          });
        }
      }

      // =====================================================================
      // STEP 4: Build the manifest
      // =====================================================================
      const manifest: AssetManifest = {
        entries,
        metadata: {
          stock_count: stockCount,
          ai_image_count: aiImageCount,
          ai_video_count: aiVideoCount,
          motiongraphic_count: mgCount,
          sfx_count: sfxCount,
        },
      };

      // =====================================================================
      // STEP 5: Persist to metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 5: Persisting asset manifest...`);

      // Build scraped stock URL map for Phase IV consumption
      const stockUrlMap: Record<string, string> = {};
      for (const [idx, result] of Object.entries(stockResults)) {
        stockUrlMap[`shot-${idx}`] = result.url;
      }

      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          asset_manifest: manifest,
          scraped_stock_images: stockUrlMap,
          resolved_prompts: resolvedPrompts,
        },
      });
      await supabase
        .from('video_projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', videoId);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: `Asset manifest complete: ${stockCount} stock, ${aiImageCount} images, ${aiVideoCount} videos, ${mgCount} MG, ${sfxCount} SFX`,
          progress_percent: 100,
        });
      }

      console.log(`${LOG_PREFIX} ✅ Complete: ${entries.length} asset entries`);

      return { success: true, videoId, output: manifest };
    }); // end costTracker.run

    await costTracker.save(videoId);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Failed for video ${videoId}:`, error);
    await costTracker.save(videoId);

    if (!isClosedLoop) {
      await updateTaskStatus(taskId, {
        status: 'failed',
        current_step: 'Asset retrieval failed',
        progress_percent: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
};
