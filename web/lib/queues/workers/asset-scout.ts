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
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { processWithStockMedia } from '@/lib/av-script/stock-media-director';
import { getEntitiesByIds } from '@/lib/services/gcm';
import type { AssetEntry, AssetManifest, PlannedShot } from '@/lib/types/closed-loop';
import { CostTracker } from '@/lib/queues/cost-tracker';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface AssetScoutJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** System prompt from the Orchestrator's Dynamic Prompt Generator */
  systemPrompt?: string;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[AssetScout]';

export const assetScoutProcessor: Processor<AssetScoutJobData> = async (
  job: Job<AssetScoutJobData>
) => {
  const { taskId, userId, videoId, aspectRatio } = job.data;
  const isClosedLoop = job.name.startsWith('closed-loop-');

  console.log(`${LOG_PREFIX} Starting for video ${videoId}${isClosedLoop ? ' (closed-loop)' : ''}`);

  const costTracker = new CostTracker(4); // Step 4 in the pipeline

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

        // Determine source type
        let source: AssetEntry['source'] = 'motiongraphic';
        if (shot.media_type === 'stock') {
          source = 'stock';
          stockCount++;
        } else if (shot.media_type === 'video') {
          source = 'ai_video';
          aiVideoCount++;
        } else if (shot.media_type === 'image') {
          // Upgrade standalone AI images → ai_video (static AI images are not engaging)
          // AI images can still be used INSIDE motion graphics as composited assets
          source = 'ai_video';
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
          visual_prompt: enrichedPrompt,
          source,
          stock_url: stockMatch?.url,
          sfx: hasSfx ? {
            url: '', // Will be populated by SFX search
            description: shot.sound_effects[0].description,
            trigger_at_seconds: shot.sound_effects[0].trigger_at_seconds,
          } : undefined,
        });

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

      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...metadata,
            asset_manifest: manifest,
            scraped_stock_images: stockUrlMap,
          },
          updated_at: new Date().toISOString(),
        })
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
