/**
 * LoRA Sync Service
 * ============================================================================
 * Ensures user-uploaded LoRAs stored in R2 are present on the GPU API
 * before video production begins. Called during orchestrator Step 0-C.
 *
 * Flow:
 * 1. Read user's LoRA configs from project settings
 * 2. List LoRAs currently available on GPU API
 * 3. Download any missing LoRAs from R2
 * 4. Upload them to GPU API via POST /api/v1/loras/z-image/upload
 *
 * The GPU VM is ephemeral and may restart between production runs,
 * so this sync must run before every production pipeline.
 */

import {
  callGpuListLoras,
  callGpuUploadLora,
  type LoraInfo,
} from '@/lib/services/gpu-api-service';
import { getS3Client, getBucketName } from '@/lib/services/r2-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { LoraConfig } from '@/types/settings';

// ============================================================================
// TYPES
// ============================================================================

export interface LoraSyncResult {
  /** Total LoRAs the user has configured */
  total: number;
  /** LoRAs already present on GPU API */
  alreadyPresent: number;
  /** LoRAs successfully synced (downloaded from R2 + uploaded to GPU) */
  synced: number;
  /** LoRAs that failed to sync */
  failed: number;
  /** Error details for failed syncs */
  errors: { loraName: string; error: string }[];
}

// ============================================================================
// SYNC SERVICE
// ============================================================================

/**
 * Extracts the LoRA filename stem from the storage key.
 * e.g., "loras/abc123/my_style.safetensors" → "my_style"
 */
function extractLoraFilename(storageKey: string): string {
  const parts = storageKey.split('/');
  const filename = parts[parts.length - 1] || storageKey;
  return filename.replace(/\.safetensors$/i, '');
}

/**
 * Download a LoRA file from R2 storage.
 */
async function downloadLoraFromR2(storageKey: string): Promise<Buffer> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`Empty response body for R2 key: ${storageKey}`);
  }

  // Stream the body into a Buffer
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Sync a single LoRA from R2 to the GPU API.
 */
async function syncSingleLora(
  lora: LoraConfig,
  gpuLoraNames: Set<string>,
): Promise<{ synced: boolean; error?: string }> {
  const loraName = extractLoraFilename(lora.storageKey);

  // Already present on GPU — skip
  if (gpuLoraNames.has(loraName)) {
    console.log(`[LoRA Sync] "${lora.name}" (extracted: "${loraName}") already on GPU, skipping`);
    return { synced: false };
  }

  console.log(
    `[LoRA Sync] "${lora.name}" (extracted: "${loraName}") NOT in GPU set: [${[...gpuLoraNames].join(', ')}]`,
  );

  try {
    console.log(`[LoRA Sync] Downloading "${lora.name}" from R2 (key: ${lora.storageKey})...`);
    const loraBuffer = await downloadLoraFromR2(lora.storageKey);
    console.log(`[LoRA Sync] Downloaded ${(loraBuffer.length / 1024 / 1024).toFixed(1)}MB, uploading to GPU API...`);

    const filename = `${loraName}.safetensors`;
    const result = await callGpuUploadLora(loraBuffer, filename);

    if (!result.success) {
      // Treat "already exists" (409) as success — GPU already has it
      if (result.error?.includes('already exists') || result.error?.includes('409')) {
        console.log(`[LoRA Sync] "${lora.name}" already exists on GPU (409), treating as present`);
        return { synced: false };
      }
      return { synced: false, error: result.error || 'Upload failed' };
    }

    console.log(`[LoRA Sync] Successfully synced "${lora.name}" to GPU API`);
    return { synced: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[LoRA Sync] Failed to sync "${lora.name}":`, errMsg);
    return { synced: false, error: errMsg };
  }
}

/**
 * Ensure all user-configured LoRAs are available on the GPU API.
 * Downloads from R2 and uploads to GPU API for any that are missing.
 *
 * Should be called at orchestrator Step 0-C, before any image generation.
 *
 * @param loras - Array of user's LoRA configurations (from project settings)
 * @returns Sync result summary
 */
export async function syncLorasToGpuApi(
  loras: LoraConfig[],
): Promise<LoraSyncResult> {
  const result: LoraSyncResult = {
    total: loras.length,
    alreadyPresent: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  if (loras.length === 0) {
    console.log('[LoRA Sync] No LoRAs configured, skipping sync');
    return result;
  }

  // 1. List what's already on the GPU
  const gpuResult = await callGpuListLoras();

  if (!gpuResult.success) {
    console.error(
      `[LoRA Sync] Failed to list GPU LoRAs: ${gpuResult.error}. ` +
      `Skipping sync to avoid redundant re-uploads.`,
    );
    return result;
  }

  const gpuLoraNames = new Set<string>(
    (gpuResult.data || []).map((l: LoraInfo) => l.name),
  );

  console.log(
    `[LoRA Sync] GPU has ${gpuLoraNames.size} LoRAs (${[...gpuLoraNames].join(', ') || 'none'}), ` +
    `user has ${loras.length} configured`,
  );

  // 2. Sync each missing LoRA
  for (const lora of loras) {
    const loraName = extractLoraFilename(lora.storageKey);

    if (gpuLoraNames.has(loraName)) {
      result.alreadyPresent++;
      continue;
    }

    const syncResult = await syncSingleLora(lora, gpuLoraNames);

    if (syncResult.synced) {
      result.synced++;
    } else if (syncResult.error) {
      result.failed++;
      result.errors.push({ loraName: lora.name, error: syncResult.error });
    } else {
      // Shouldn't happen given the check above, but handle gracefully
      result.alreadyPresent++;
    }
  }

  console.log(
    `[LoRA Sync] Complete: ${result.alreadyPresent} present, ${result.synced} synced, ${result.failed} failed`,
  );

  return result;
}
