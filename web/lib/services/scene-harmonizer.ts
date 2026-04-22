/**
 * Scene Harmonizer Service
 * ============================================================================
 * Post-generation service that harmonizes visual consistency across
 * thematically related shots using the image-edit batch API.
 *
 * Runs AFTER keyframe images are generated but BEFORE video generation.
 * Groups consecutive shots into visual sequences (using thematic similarity),
 * selects a style anchor, and dispatches batch image-edit jobs to harmonize
 * subsequent shots in each sequence.
 *
 * This is PROACTIVE image editing — not reactive (from verifier failures).
 */

import type { PlannedShot } from '@/lib/types/closed-loop';
import { groupIntoVisualSequences } from '@/lib/services/shot-context';
import {
  callGpuBatchImageEdit,
  type BatchImageEditItem,
} from '@/lib/services/gpu-api-service';
import {
  generateMediaKey,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  getKeyFromUrl,
  getPublicUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface HarmonizationResult {
  /** Map of shot-{index} → harmonized image URL */
  updatedImages: Record<string, string>;
  /** Number of shots harmonized */
  harmonized: number;
  /** Number of shots skipped */
  skipped: number;
  /** Sequences detected */
  sequences: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[SceneHarmonizer]';
const SIMILARITY_THRESHOLD = 0.25;
const MIN_SEQUENCE_SIZE = 2;
/** Timeout per image edit webhook (Qwen-Edit warmed up: ~15-30s; 90s gives ample headroom) */
const EDIT_TIMEOUT_MS = 90_000;

function groupPlannerFirstSequences(imageShots: PlannedShot[]): number[][] {
  const clusterGroups = new Map<string, number[]>();

  imageShots.forEach((shot, index) => {
    if (!shot.scene_cluster_id) return;
    const group = clusterGroups.get(shot.scene_cluster_id) || [];
    group.push(index);
    clusterGroups.set(shot.scene_cluster_id, group);
  });

  const plannerDrivenGroups = [...clusterGroups.values()].filter(group => group.length >= MIN_SEQUENCE_SIZE);
  if (plannerDrivenGroups.length > 0) {
    return plannerDrivenGroups;
  }

  return groupIntoVisualSequences(imageShots, SIMILARITY_THRESHOLD);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Harmonize generated images across thematically related shot sequences.
 *
 * @param userId - User ID for storage paths
 * @param videoId - Video project ID
 * @param shots - Full shot list from the shot plan
 * @param generatedImages - Map of shot-{index} → generated image URL
 * @param onProgress - Optional progress callback
 * @returns Updated image URLs and stats
 */
export async function harmonizeSceneImages(
  userId: string,
  videoId: string,
  shots: PlannedShot[],
  generatedImages: Record<string, string>,
  onProgress?: (message: string) => void,
): Promise<HarmonizationResult> {
  const result: HarmonizationResult = {
    updatedImages: {},
    harmonized: 0,
    skipped: 0,
    sequences: 0,
  };

  // Filter to only shots that have generated images (not stock, not pure MG)
  const imageShotIndices = new Set<number>();
  for (const [key, url] of Object.entries(generatedImages)) {
    if (url && key.startsWith('shot-')) {
      const idx = parseInt(key.replace('shot-', ''), 10);
      if (!isNaN(idx)) imageShotIndices.add(idx);
    }
  }

  const imageShots = shots.filter(s =>
    imageShotIndices.has(s.segment_index) &&
    s.media_type !== 'stock'
  );

  if (imageShots.length < MIN_SEQUENCE_SIZE) {
    console.log(`${LOG_PREFIX} Only ${imageShots.length} image shots — skipping harmonization`);
    return result;
  }

  // Group into visual sequences
  const sequenceGroups = groupPlannerFirstSequences(imageShots);
  const multiShotSequences = sequenceGroups.filter(g => g.length >= MIN_SEQUENCE_SIZE);
  result.sequences = multiShotSequences.length;

  if (multiShotSequences.length === 0) {
    console.log(`${LOG_PREFIX} No multi-shot sequences detected — skipping harmonization`);
    return result;
  }

  console.log(
    `${LOG_PREFIX} Found ${multiShotSequences.length} visual sequences ` +
    `(${multiShotSequences.map(g => g.length).join(', ')} shots each)`
  );

  // Collect all edit items across all sequences for a single batch submission
  const batchItems: BatchImageEditItem[] = [];
  const itemIdToShotKey = new Map<string, string>();
  const itemIdToPublicUrl = new Map<string, string>();

  for (const groupIndices of multiShotSequences) {
    const sequenceShots = groupIndices.map(i => imageShots[i]);
    const anchorShot = sequenceShots[0];
    const anchorKey = `shot-${anchorShot.segment_index}`;
    const anchorUrl = generatedImages[anchorKey];

    if (!anchorUrl) {
      console.warn(`${LOG_PREFIX} No anchor image for sequence starting at shot ${anchorShot.segment_index}`);
      result.skipped += sequenceShots.length;
      continue;
    }

    const anchorPrompt = anchorShot.visual_description || anchorShot.summary || '';
    console.log(
      `${LOG_PREFIX} Sequence: shots [${sequenceShots.map(s => s.segment_index).join(', ')}] ` +
      `— anchor: shot ${anchorShot.segment_index}`
    );

    // Generate a presigned GET URL for the anchor image
    let anchorPresignedUrl: string;
    try {
      const anchorStorageKey = getKeyFromUrl(anchorUrl);
      anchorPresignedUrl = await generatePresignedGetUrl(anchorStorageKey);
    } catch {
      console.warn(`${LOG_PREFIX} Failed to get presigned URL for anchor — skipping sequence`);
      result.skipped += sequenceShots.length;
      continue;
    }

    onProgress?.(`Harmonizing ${sequenceShots.length} shots in visual sequence...`);

    // Build edit items for each non-anchor shot in the sequence
    for (let i = 1; i < sequenceShots.length; i++) {
      const shot = sequenceShots[i];
      const shotKey = `shot-${shot.segment_index}`;
      const shotUrl = generatedImages[shotKey];

      if (!shotUrl) {
        result.skipped++;
        continue;
      }

      try {
        // Generate presigned URLs
        const sourceKey = getKeyFromUrl(shotUrl);
        const sourcePresignedUrl = await generatePresignedGetUrl(sourceKey);
        const outputFilename = `shot_${shot.segment_index}_harmonized.png`;
        const outputKey = generateMediaKey(userId, videoId, STORAGE_PATHS.IMAGES.GENERATED, outputFilename);
        const { putUrl: outputPutUrl } = await generatePresignedPutUrl(outputKey, 'image/png');

        const itemId = `harmonize-${shot.segment_index}-${uuidv4().slice(0, 8)}`;
        const editPrompt = buildHarmonizationPrompt(anchorPrompt, shot, i);

        batchItems.push({
          item_id: itemId,
          input_image_url: sourcePresignedUrl,
          prompt: editPrompt,
          save_url: outputPutUrl,
        });

        itemIdToShotKey.set(itemId, shotKey);
        itemIdToPublicUrl.set(itemId, getPublicUrl(outputKey));
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error preparing shot ${shot.segment_index}:`, err);
        result.skipped++;
      }
    }
  }

  if (batchItems.length === 0) {
    console.log(`${LOG_PREFIX} No edit items to submit`);
    return result;
  }

  // Submit batch edit
  const batchId = `harmonize-${videoId}-${uuidv4().slice(0, 8)}`;
  const webhookUrl = process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
  const webhookSecret = process.env.GPU_WEBHOOK_SECRET;

  console.log(`${LOG_PREFIX} Submitting batch edit ${batchId} with ${batchItems.length} items`);

  const submitResult = await callGpuBatchImageEdit(
    batchId,
    batchItems,
    webhookUrl,
    webhookSecret,
  );

  if (!submitResult.success) {
    console.warn(`${LOG_PREFIX} Batch edit submission failed: ${submitResult.errorMessage}`);
    result.skipped += batchItems.length;
    return result;
  }

  // Wait for all webhooks
  const webhookPromises = batchItems.map(async (item) => {
    try {
      const webhookResult = await waitForWebhookResult(item.item_id, EDIT_TIMEOUT_MS);
      const shotKey = itemIdToShotKey.get(item.item_id);

      if (webhookResult?.status === 'completed' && webhookResult.result?.save_url && shotKey) {
        result.updatedImages[shotKey] = itemIdToPublicUrl.get(item.item_id) || webhookResult.result.save_url;
        result.harmonized++;
        console.log(`${LOG_PREFIX} ✓ ${shotKey} harmonized`);
      } else {
        console.warn(`${LOG_PREFIX} ✗ ${item.item_id} edit failed — using original`);
        result.skipped++;
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} ✗ ${item.item_id} webhook error:`, err);
      result.skipped++;
    }
  });

  await Promise.allSettled(webhookPromises);

  console.log(
    `${LOG_PREFIX} Complete: ${result.harmonized} harmonized, ${result.skipped} skipped, ` +
    `${result.sequences} sequences`
  );

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a targeted edit instruction for style harmonization + angle variation.
 *
 * Uses Qwen-Edit's camera angle vocabulary (azimuth × elevation × distance)
 * for precise viewpoint control. Each position in a visual sequence gets
 * a unique camera position combination, maintaining visual coherence while
 * providing variety.
 */
function buildHarmonizationPrompt(
  anchorPrompt: string,
  shot: PlannedShot,
  positionInSequence: number = 1,
): string {
  const shotPrompt = shot.visual_description || shot.summary || '';

  // Qwen-Edit camera positions using its native vocabulary:
  // [azimuth] [elevation] [distance]
  const CAMERA_POSITIONS = [
    { view: 'front-right quarter view', angle: 'eye-level shot', distance: 'close-up' },
    { view: 'left side view', angle: 'slightly elevated shot', distance: 'wide shot' },
    { view: 'front view', angle: 'low-angle shot', distance: 'medium shot' },
    { view: 'right side view', angle: 'high-angle shot', distance: 'close-up' },
    { view: 'front-left quarter view', angle: 'eye-level shot', distance: 'wide shot' },
    { view: 'back-right quarter view', angle: 'elevated shot', distance: 'medium shot' },
  ];
  const pos = CAMERA_POSITIONS[(positionInSequence - 1) % CAMERA_POSITIONS.length];

  return [
    `Show this scene from a different camera angle: ${pos.view}, ${pos.angle}, ${pos.distance} framing.`,
    `Original scene: "${anchorPrompt.substring(0, 150)}".`,
    `This shot should depict: "${shotPrompt.substring(0, 150)}".`,
    `Match the color grading, lighting mood, and visual style of the original exactly.`,
    `Keep the same setting, characters, and atmosphere — only change the camera viewpoint and framing.`,
  ].join(' ');
}

