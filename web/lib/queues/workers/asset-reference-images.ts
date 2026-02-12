/**
 * Asset Reference Image Worker
 * ============================================================================
 * BullMQ worker for generating reference images for video assets.
 *
 * Generates AI reference images for all assets in the asset registry
 * (characters, locations, objects) using the GPU API with LORA/aspect ratio
 * settings from the project configuration.
 *
 * Uses webhook-based completion instead of polling:
 * 1. Worker submits job with webhook_url and item_id
 * 2. Worker waits for webhook result via Redis pub/sub
 * 3. GPU callback updates Supabase and notifies worker
 */

import { Job, Processor } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  getSupabaseServiceClient,
  updateTaskStatus,
  updateTaskOutput,
} from '@/lib/queues/shared';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import {
  isR2Configured,
  generatePresignedPutUrl,
  generateMediaKey,
  getPublicUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';
import {
  callGpuImageGenerate,
} from '@/lib/services/gpu-api-service';
import type { AspectRatio } from '@/lib/services/gpu-api-service';
import {
  buildCharacterPrompt,
  buildLocationPrompt,
  buildObjectPrompt,
} from '@/lib/av-script/asset-prompt-builder';
import type {
  CharacterProfile,
  LocationProfile,
  ObjectProfile,
} from '@/lib/queues/writing/types';
import { waitForGpuReady } from './gpu-health-guard';

// ============================================================================
// CONFIGURATION
// ============================================================================

const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// Number of assets to process concurrently
const CONCURRENCY = 3;

// Timeout for waiting for webhook completion (5 minutes)
const WEBHOOK_TIMEOUT_MS = 300000;

// ============================================================================
// JOB DATA & OUTPUT INTERFACES
// ============================================================================

export interface AssetReferenceImageJobData {
  taskId?: string;
  userId: string;
  videoId: string;
  assetRegistry: {
    characters?: CharacterProfile[];
    locations?: LocationProfile[];
    objects?: ObjectProfile[];
  };
  aspectRatio: AspectRatio;
  loraName?: string;
}

export interface AssetReferenceImageResult {
  assetId: string;
  assetType: 'character' | 'location' | 'object';
  name: string;
  referenceImageUrl: string | null;
  status: 'completed' | 'failed';
  error?: string;
  generationTimeSeconds?: number;
}

export interface AssetReferenceImageOutput {
  assets: AssetReferenceImageResult[];
  metadata: {
    totalAssets: number;
    completedAssets: number;
    failedAssets: number;
    totalGenerationTimeSeconds: number;
  };
}

// ============================================================================
// HELPER: WAIT FOR WEBHOOK RESULT
// ============================================================================

async function waitForGpuCompletion(
  itemId: string,
  assetName: string,
  timeoutMs: number = WEBHOOK_TIMEOUT_MS
): Promise<{
  success: boolean;
  generationTime?: number;
  publicUrl?: string;
  errorMessage?: string;
}> {
  console.log(`[Assets/ReferenceImages] Waiting for webhook result for ${assetName} (${itemId})...`);

  try {
    const webhookResult = await waitForWebhookResult(itemId, timeoutMs);

    if (webhookResult.status === 'completed') {
      return {
        success: true,
        generationTime: webhookResult.result?.generation_time,
        publicUrl: webhookResult.result?.save_url,
      };
    } else {
      return {
        success: false,
        errorMessage: webhookResult.errorMessage || 'GPU job failed',
      };
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error waiting for webhook',
    };
  }
}

// ============================================================================
// HELPER: GENERATE STORAGE KEY FOR ASSET
// ============================================================================

function getAssetStoragePath(assetType: 'character' | 'location' | 'object'): string {
  switch (assetType) {
    case 'character':
      return STORAGE_PATHS.IMAGES.REFERENCE.CHARACTERS;
    case 'location':
      return STORAGE_PATHS.IMAGES.REFERENCE.SETTINGS;
    case 'object':
      return STORAGE_PATHS.IMAGES.REFERENCE.OBJECTS;
    default:
      return STORAGE_PATHS.IMAGES.REFERENCE.CHARACTERS;
  }
}

// ============================================================================
// HELPER: PROCESS SINGLE ASSET
// ============================================================================

async function processAsset(
  asset: {
    id: string;
    type: 'character' | 'location' | 'object';
    name: string;
    prompt: string;
  },
  userId: string,
  videoId: string,
  aspectRatio: AspectRatio,
  loraName?: string
): Promise<AssetReferenceImageResult> {
  const logPrefix = `[Assets/ReferenceImages]`;

  console.log(`${logPrefix} Processing ${asset.type}: ${asset.name} (${asset.id})`);

  try {
    // Generate storage key and presigned URL
    const storagePath = getAssetStoragePath(asset.type);
    const filename = `${asset.id}.png`;
    const key = generateMediaKey(userId, videoId, storagePath, filename);
    const { putUrl } = await generatePresignedPutUrl(key, 'image/png');
    const publicUrl = getPublicUrl(key);

    // Generate unique item ID for webhook correlation
    const itemId = `asset-ref-${videoId}-${asset.id}-${uuidv4().slice(0, 8)}`;
    const gpuJobId = uuidv4();

    // Calculate dimensions based on aspect ratio
    const width = aspectRatio === '9:16' ? 768 : 1024;
    const height = aspectRatio === '9:16' ? 1024 : 768;

    // Call GPU API
    const result = await callGpuImageGenerate({
      job_id: gpuJobId,
      prompt: asset.prompt,
      aspect_ratio: aspectRatio,
      width,
      height,
      num_inference_steps: 20,
      lora_name: loraName,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    });

    // If async, wait for webhook
    if (result.success && result.isAsync) {
      const webhookResult = await waitForGpuCompletion(itemId, asset.name);

      if (!webhookResult.success) {
        throw new Error(webhookResult.errorMessage || 'GPU generation failed');
      }

      console.log(`${logPrefix} Completed ${asset.name}: ${publicUrl} (${webhookResult.generationTime}s)`);

      return {
        assetId: asset.id,
        assetType: asset.type,
        name: asset.name,
        referenceImageUrl: publicUrl,
        status: 'completed',
        generationTimeSeconds: webhookResult.generationTime,
      };
    }

    // Synchronous completion
    if (result.success) {
      console.log(`${logPrefix} Completed ${asset.name}: ${publicUrl} (${result.generationTime}s)`);

      return {
        assetId: asset.id,
        assetType: asset.type,
        name: asset.name,
        referenceImageUrl: publicUrl,
        status: 'completed',
        generationTimeSeconds: result.generationTime,
      };
    }

    // Error
    throw new Error(result.errorMessage || 'GPU API returned error');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Failed ${asset.name}:`, errorMessage);

    return {
      assetId: asset.id,
      assetType: asset.type,
      name: asset.name,
      referenceImageUrl: null,
      status: 'failed',
      error: errorMessage,
    };
  }
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

export const assetReferenceImageProcessor: Processor<AssetReferenceImageJobData> = async (
  job: Job<AssetReferenceImageJobData>
) => {
  const { taskId, userId, videoId, assetRegistry, aspectRatio, loraName } = job.data;
  const logPrefix = '[Assets/ReferenceImages]';

  console.log(`${logPrefix} Starting job ${job.id} for video ${videoId}`);

  // ══════════════════════════════════════════════════════════════════════════
  // PRE-FLIGHT: Ensure GPU VM is ready before processing
  // ══════════════════════════════════════════════════════════════════════════
  const vmStatus = await waitForGpuReady(userId, logPrefix);
  console.log(`${logPrefix} Proceeding with GPU VM at ${vmStatus.ip}`);

  // Validate R2 configuration
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  const supabase = getSupabaseServiceClient();
  const startTime = Date.now();

  try {
    // Build list of all assets with prompts
    const assets: Array<{
      id: string;
      type: 'character' | 'location' | 'object';
      name: string;
      prompt: string;
    }> = [];

    // Characters
    for (const char of assetRegistry.characters || []) {
      assets.push({
        id: char.id,
        type: 'character',
        name: char.name,
        prompt: buildCharacterPrompt(char),
      });
    }

    // Locations
    for (const loc of assetRegistry.locations || []) {
      assets.push({
        id: loc.id,
        type: 'location',
        name: loc.name,
        prompt: buildLocationPrompt(loc),
      });
    }

    // Objects
    for (const obj of assetRegistry.objects || []) {
      assets.push({
        id: obj.id,
        type: 'object',
        name: obj.name,
        prompt: buildObjectPrompt(obj),
      });
    }

    const totalAssets = assets.length;
    console.log(`${logPrefix} Generating reference images for ${totalAssets} assets`);

    if (totalAssets === 0) {
      console.log(`${logPrefix} No assets to process`);
      return { success: true, assets: [], metadata: { totalAssets: 0, completedAssets: 0, failedAssets: 0, totalGenerationTimeSeconds: 0 } };
    }

    // Update task status
    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'running',
        progress_percent: 5,
        current_step: `Generating images for ${totalAssets} assets...`,
      });
    }

    // Process assets in batches
    const results: AssetReferenceImageResult[] = [];
    let completedCount = 0;

    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      const batch = assets.slice(i, i + CONCURRENCY);
      const batchNames = batch.map((a) => a.name).join(', ');

      console.log(`${logPrefix} Processing batch ${Math.floor(i / CONCURRENCY) + 1}: ${batchNames}`);

      if (taskId) {
        await updateTaskStatus(taskId, {
          progress_percent: Math.round((completedCount / totalAssets) * 100),
          current_step: `Generating: ${batchNames}...`,
        });
      }

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((asset) =>
          processAsset(asset, userId, videoId, aspectRatio, loraName)
        )
      );

      results.push(...batchResults);
      completedCount += batchResults.length;
    }

    // Calculate statistics
    const completedAssets = results.filter((r) => r.status === 'completed').length;
    const failedAssets = results.filter((r) => r.status === 'failed').length;
    const totalGenerationTimeSeconds = (Date.now() - startTime) / 1000;

    const output: AssetReferenceImageOutput = {
      assets: results,
      metadata: {
        totalAssets,
        completedAssets,
        failedAssets,
        totalGenerationTimeSeconds,
      },
    };

    console.log(`${logPrefix} Complete: ${completedAssets}/${totalAssets} succeeded, ${failedAssets} failed (${totalGenerationTimeSeconds.toFixed(1)}s)`);

    // Save to video metadata
    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;

    // Build asset reference image map
    const assetReferenceImages: Record<string, string> = {};
    for (const result of results) {
      if (result.status === 'completed' && result.referenceImageUrl) {
        assetReferenceImages[result.assetId] = result.referenceImageUrl;
      }
    }

    const updatedMetadata = {
      ...existingMetadata,
      assetReferenceImages,
      assetReferenceImagesGeneratedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('video_projects')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (updateError) {
      console.error(`${logPrefix} Failed to update video metadata:`, updateError);
    }

    // Update task as completed
    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'completed',
        progress_percent: 100,
        current_step: `Complete: ${completedAssets}/${totalAssets} images generated`,
      });
      await updateTaskOutput(taskId, output as any);
    }

    return {
      success: true,
      videoId,
      ...output,
    };
  } catch (error) {
    console.error(`${logPrefix} Failed for video ${videoId}:`, error);

    // Update task as failed
    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'failed',
        progress_percent: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
};
