/**
 * R2 Storage Service
 * ============================================================================
 * Cloudflare R2 storage service using the S3-compatible API.
 * Used for storing TTS audio files and other media assets.
 * 
 * Storage Structure:
 *   {userId}/{videoId}/audio/{tts,sound-effects,background-music,stock}/
 *   {userId}/{videoId}/images/{reference/{characters,settings,objects},stock,generated}/
 *   {userId}/{videoId}/footage/{stock,generated}/
 *   {userId}/{videoId}/exports/
 *   {userId}/gpu-api-test/
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ============================================================================
// Storage Path Constants
// ============================================================================

export const STORAGE_PATHS = {
  // Temporary/disposable content (can be wiped anytime via admin tools)
  TEMPORARY: 'temporary',
  
  // Root prefix for user data
  USERS: 'users',
  
  // Top-level folders under users/{userId}
  VIDEOS: 'videos',
  PAYMENT_PROOFS: 'payment-proofs',
  GPU_TEST: 'gpu-api-test',
  
  // Stock scraper unified media library (under temporary/)
  STOCK_SCRAPER: {
    ROOT: 'temporary/stock-scraper',
    SOURCES: 'temporary/stock-scraper/sources',      // Original downloads
    FOOTAGE: 'temporary/stock-scraper/footage',       // All video clips
    IMAGES: 'temporary/stock-scraper/images',         // All images
    AUDIO: 'temporary/stock-scraper/audio',           // All audio
    THUMBNAILS: 'temporary/stock-scraper/thumbnails', // All thumbnails
  },
  
  // Nested paths under videos/{videoId}/
  AUDIO: {
    TTS: 'audio/tts',
    SOUND_EFFECTS: 'audio/sound-effects',
    BACKGROUND_MUSIC: 'audio/background-music',
    STOCK: 'audio/stock',
    VIDEO_EMBEDDED: 'audio/video-embedded',
  },
  IMAGES: {
    REFERENCE: {
      CHARACTERS: 'images/reference/characters',
      SETTINGS: 'images/reference/settings',
      OBJECTS: 'images/reference/objects',
    },
    STOCK: 'images/stock',
    GENERATED: 'images/generated',
  },
  FOOTAGE: {
    STOCK: 'footage/stock',
    GENERATED: 'footage/generated',
  },
  EXPORTS: 'exports',
  
  // Video Editor V2 - cross-project media library
  VIDEO_EDITOR: {
    ROOT: 'video-editor',
    MEDIA: 'video-editor/media',           // User's media library
    THUMBNAILS: 'video-editor/thumbnails', // Generated thumbnails
    PROJECTS: 'video-editor/projects',     // Project-specific media
    AUDIO: 'video-editor/audio',           // Derived/normalized editor audio
  },
} as const;

// Initialize S3 client for R2
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 configuration. Required: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // Disable automatic checksum calculation for presigned URLs
    // AWS SDK v3.729+ adds CRC32 checksums by default, which causes
    // SignatureDoesNotMatch errors when external services (GPU API)
    // upload without sending the checksum headers
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return s3Client;
}

export function getBucketName(): string {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("Missing R2_BUCKET_NAME environment variable");
  }
  return bucketName;
}

export function getPublicBaseUrl(): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("Missing R2_PUBLIC_URL environment variable");
  }
  return publicUrl.replace(/\/$/, ""); // Remove trailing slash
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

/**
 * Upload an audio buffer to R2 storage.
 * 
 * @param buffer - The audio data buffer
 * @param key - The storage key (path) for the file
 * @param contentType - MIME type (default: audio/mpeg)
 * @returns Upload result with public URL
 */
export async function uploadAudioBuffer(
  buffer: Buffer,
  key: string,
  contentType: string = "audio/mpeg"
): Promise<UploadResult> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  return {
    key,
    url: getPublicUrl(key),
    size: buffer.length,
  };
}

/**
 * Get the public URL for a stored file.
 * 
 * @param key - The storage key (path) of the file
 * @returns Public URL
 */
export function getPublicUrl(key: string): string {
  const baseUrl = getPublicBaseUrl();
  return `${baseUrl}/${key}`;
}

// ============================================================================
// Key Generation Functions
// ============================================================================

/**
 * Generate a storage key for project media files.
 * Path format: {userId}/videos/{videoId}/{storagePath}/{filename}
 * 
 * @param userId - User ID
 * @param videoId - Video project ID
 * @param storagePath - Path from STORAGE_PATHS (e.g., STORAGE_PATHS.AUDIO.TTS)
 * @param filename - The filename with extension
 * @returns Storage key
 */
export function generateMediaKey(
  userId: string,
  videoId: string,
  storagePath: string,
  filename: string
): string {
  return `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${storagePath}/${filename}`;
}

/**
 * Generate a storage key for payment proof uploads.
 * Path format: {userId}/payment-proofs/{statementId}/{timestamp}.{ext}
 */
export function generatePaymentProofKey(
  userId: string,
  statementId: string,
  extension: string
): string {
  const timestamp = Date.now();
  return `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.PAYMENT_PROOFS}/${statementId}/${timestamp}.${extension}`;
}

/**
 * Generate a storage key for revenue proof uploads.
 * @deprecated Use generatePaymentProofKey instead - proofs are consolidated
 */
export const generateRevenueProofKey = generatePaymentProofKey;

/**
 * Generate a storage key for a user-uploaded LoRA file.
 * Path format: loras/{userId}/{loraId}/{filename}
 *
 * @param userId - User ID
 * @param loraId - UUID for this LoRA upload
 * @param filename - Original filename (sanitised automatically)
 * @returns Storage key
 */
export function generateLoraStorageKey(
  userId: string,
  loraId: string,
  filename: string,
): string {
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `loras/${userId}/${loraId}/${cleanFilename}`;
}

/**
 * Generate a storage key for TTS audio chunk.
 * Path format: {userId}/{videoId}/audio/tts/chunk_XXX.mp3
 * 
 * @param userId - User ID
 * @param videoId - Video project ID
 * @param chunkIndex - Index of the audio chunk
 * @returns Storage key
 */
export function generateTtsKey(
  userId: string,
  videoId: string,
  chunkIndex: number
): string {
  const filename = `chunk_${chunkIndex.toString().padStart(3, "0")}.mp3`;
  return generateMediaKey(userId, videoId, STORAGE_PATHS.AUDIO.TTS, filename);
}

/**
 * Generate storage key for final merged TTS audio.
 * Path format: {userId}/{videoId}/audio/tts/final.mp3
 */
export function generateFinalTtsKey(
  userId: string,
  videoId: string
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.AUDIO.TTS, 'final.mp3');
}

/**
 * Delete a file from R2 storage.
 * 
 * @param key - The storage key (path) of the file
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await client.send(command);
}

/**
 * Batch delete multiple files from R2 storage.
 * Uses S3's DeleteObjectsCommand for efficient multi-key deletion.
 * Handles batching automatically (max 1000 keys per request).
 * 
 * @param keys - Array of storage keys to delete
 * @returns Object with count of deleted files and any errors
 */
export async function deleteFiles(keys: string[]): Promise<{ deleted: number; errors: string[] }> {
  if (keys.length === 0) {
    return { deleted: 0, errors: [] };
  }

  const client = getS3Client();
  const bucketName = getBucketName();
  const errors: string[] = [];
  let deleted = 0;

  // S3 allows max 1000 keys per DeleteObjects request
  const BATCH_SIZE = 1000;
  
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    
    try {
      const command = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
          Quiet: true, // Don't return individual success responses
        },
      });

      const response = await client.send(command);
      
      // Count deleted (batch size minus errors)
      const batchErrors = response.Errors?.length ?? 0;
      deleted += batch.length - batchErrors;
      
      // Collect individual errors
      if (response.Errors) {
        for (const err of response.Errors) {
          errors.push(`Failed to delete ${err.Key}: ${err.Message || 'Unknown error'}`);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`Batch delete failed: ${errorMessage}`);
    }
  }

  return { deleted, errors };
}

/**
 * Get a file from R2 storage as a base64 data URL.
 * Uses the S3 API directly, bypassing CDN caching/propagation.
 * 
 * @param key - The storage key (path) of the file
 * @returns Base64 data URL (e.g., "data:image/jpeg;base64,...")
 */
export async function getFileAsBase64(key: string): Promise<string> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await client.send(command);
  
  if (!response.Body) {
    throw new Error(`No body returned for key: ${key}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  // Determine MIME type from content-type or key extension
  let mimeType = response.ContentType || 'application/octet-stream';
  if (mimeType === 'application/octet-stream') {
    // Fallback to guessing from extension
    const ext = key.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    mimeType = mimeTypes[ext || ''] || mimeType;
  }

  // Convert to base64 data URL
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Generate a presigned PUT URL for direct upload to R2.
 * This allows external services (like the GPU API) to upload directly to R2 without credentials.
 * 
 * @param key - The storage key (path) for the file
 * @param contentType - MIME type of the file
 * @param expiresInSeconds - URL expiration time (default: 1 hour)
 * @returns Object with presigned PUT URL and public URL
 */
export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 3600
): Promise<{ putUrl: string; publicUrl: string }> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const putUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    putUrl,
    publicUrl: getPublicUrl(key),
  };
}

/**
 * Generate a presigned GET URL for downloading a file from R2.
 * This allows external services (like the GPU API) to download files
 * from R2 without needing public access or credentials.
 * 
 * @param key - The storage key (path) of the file
 * @param expiresInSeconds - URL expiration time (default: 1 hour)
 * @returns Presigned GET URL
 */
export async function generatePresignedGetUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Generate storage key for GPU API test outputs.
 * Path format: temporary/gpu-api-test/{userId}/{type}_{timestamp}_{random}.{ext}
 * 
 * @param userId - User ID
 * @param type - Type of asset (image, video, music, sfx)
 * @param extension - File extension (default: png for images, mp4 for videos, mp3 for audio)
 * @returns Storage key
 */
export function generateGpuTestKey(
  userId: string,
  type: "image" | "video" | "music" | "sfx",
  extension?: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const ext = extension || (type === "video" ? "mp4" : type === "image" ? "png" : "mp3");
  return `${STORAGE_PATHS.TEMPORARY}/${STORAGE_PATHS.GPU_TEST}/${userId}/${type}_${timestamp}_${random}.${ext}`;
}

/**
 * Generate storage key for stock scraper source video.
 * Path format: stock-scraper/sources/{sourceId}/video.mp4
 */
export function generateStockScraperSourceKey(sourceId: string): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.SOURCES}/${sourceId}/video.mp4`;
}

/**
 * Generate storage key for stock scraper source thumbnail.
 * Path format: stock-scraper/sources/{sourceId}/thumbnail.jpg
 */
export function generateStockScraperSourceThumbnailKey(sourceId: string): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.SOURCES}/${sourceId}/thumbnail.jpg`;
}

/**
 * Generate storage key for stock scraper video clip (unified location).
 * Path format: stock-scraper/footage/{clipId}.mp4
 */
export function generateStockScraperClipKey(clipId: string): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.FOOTAGE}/${clipId}.mp4`;
}

/**
 * Generate storage key for stock scraper clip thumbnail.
 * Path format: stock-scraper/thumbnails/{clipId}.jpg
 */
export function generateStockScraperClipThumbnailKey(clipId: string): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.THUMBNAILS}/${clipId}.jpg`;
}

/**
 * Generate storage key for stock scraper image.
 * Path format: stock-scraper/images/{imageId}.jpg
 */
export function generateStockScraperImageKey(imageId: string, ext: string = 'jpg'): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.IMAGES}/${imageId}.${ext}`;
}

/**
 * Generate storage key for stock scraper audio.
 * Path format: stock-scraper/audio/{audioId}.mp3
 */
export function generateStockScraperAudioKey(audioId: string, ext: string = 'mp3'): string {
  return `${STORAGE_PATHS.STOCK_SCRAPER.AUDIO}/${audioId}.${ext}`;
}

// ============================================================================
// Video Editor V2 Key Generators
// ============================================================================
// Used by the professional video editor for media library storage.

/**
 * Generate storage key for video editor media file.
 * Path format: video-editor/{userId}/media/{uuid}-{filename}
 * or: video-editor/{userId}/projects/{projectId}/{uuid}-{filename}
 * 
 * @param userId - User ID
 * @param projectId - Optional project ID (if media is project-specific)
 * @param filename - Original filename
 * @returns Storage key
 */
export function generateVideoEditorMediaKey(
  userId: string,
  projectId: string | null,
  filename: string
): string {
  const uuid = crypto.randomUUID();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (projectId) {
    return `${STORAGE_PATHS.VIDEO_EDITOR.PROJECTS}/${userId}/${projectId}/${uuid}-${safeName}`;
  }
  return `${STORAGE_PATHS.VIDEO_EDITOR.MEDIA}/${userId}/${uuid}-${safeName}`;
}

/**
 * Generate storage key for video editor thumbnail.
 * Path format: video-editor/{userId}/thumbnails/{uuid}.{ext}
 * or: video-editor/{userId}/projects/{projectId}/thumbnails/{uuid}.{ext}
 * 
 * @param userId - User ID
 * @param projectId - Optional project ID
 * @param extension - File extension (default: jpg)
 * @returns Storage key
 */
export function generateVideoEditorThumbnailKey(
  userId: string,
  projectId: string | null,
  extension: string = 'jpg'
): string {
  const uuid = crypto.randomUUID();
  
  if (projectId) {
    return `${STORAGE_PATHS.VIDEO_EDITOR.PROJECTS}/${userId}/${projectId}/thumbnails/${uuid}.${extension}`;
  }
  return `${STORAGE_PATHS.VIDEO_EDITOR.THUMBNAILS}/${userId}/${uuid}.${extension}`;
}

/**
 * Generate storage key for derived editor audio (normalized uploads,
 * extracted embedded video audio, and externally ingested audio).
 *
 * Path format:
 *   video-editor/media/{userId}/audio/{basename}.{ext}
 *   video-editor/projects/{userId}/{projectId}/audio/{basename}.{ext}
 */
export function generateVideoEditorDerivedAudioKey(
  userId: string,
  projectId: string | null,
  basename: string,
  extension: string = 'mp3'
): string {
  const safeBase = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, '') || 'mp3';

  if (projectId) {
    return `${STORAGE_PATHS.VIDEO_EDITOR.PROJECTS}/${userId}/${projectId}/audio/${safeBase}.${safeExt}`;
  }

  return `${STORAGE_PATHS.VIDEO_EDITOR.MEDIA}/${userId}/audio/${safeBase}.${safeExt}`;
}

// ============================================================================
// Video Project Stock Media Key Generators
// ============================================================================
// These are used during video generation to store stock media per-project,
// as opposed to the global stock-scraper paths used by the admin tool.

/**
 * Generate storage key for video project stock image.
 * Path format: users/{userId}/videos/{videoId}/images/stock/{imageId}.{ext}
 */
export function generateVideoStockImageKey(
  userId: string,
  videoId: string,
  imageId: string,
  ext: string = 'jpg'
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.IMAGES.STOCK, `${imageId}.${ext}`);
}

/**
 * Generate storage key for video project stock footage clip.
 * Path format: users/{userId}/videos/{videoId}/footage/stock/{clipId}.mp4
 */
export function generateVideoStockClipKey(
  userId: string,
  videoId: string,
  clipId: string
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.FOOTAGE.STOCK, `${clipId}.mp4`);
}

/**
 * Generate storage key for video project stock clip thumbnail.
 * Path format: users/{userId}/videos/{videoId}/footage/stock/{clipId}-thumb.jpg
 */
export function generateVideoStockClipThumbnailKey(
  userId: string,
  videoId: string,
  clipId: string
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.FOOTAGE.STOCK, `${clipId}-thumb.jpg`);
}

/**
 * Generate storage key for video project source video (e.g., downloaded YouTube video).
 * Path format: users/{userId}/videos/{videoId}/footage/stock/source-{sourceId}.mp4
 */
export function generateVideoSourceKey(
  userId: string,
  videoId: string,
  sourceId: string
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.FOOTAGE.STOCK, `source-${sourceId}.mp4`);
}

/**
 * Generate storage key for video project source thumbnail.
 * Path format: users/{userId}/videos/{videoId}/footage/stock/source-{sourceId}-thumb.jpg
 */
export function generateVideoSourceThumbnailKey(
  userId: string,
  videoId: string,
  sourceId: string
): string {
  return generateMediaKey(userId, videoId, STORAGE_PATHS.FOOTAGE.STOCK, `source-${sourceId}-thumb.jpg`);
}

/**
 * Check if R2 is configured.
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

// [DEVTOOLS-MEDIA] - List files by prefix for DevTools media browsing. Remove when no longer needed.
/**
 * List all files under a given prefix from R2 storage.
 * Returns metadata for each object (key, size, lastModified).
 * 
 * @param prefix - The prefix (folder path) to list files from
 * @returns Array of file metadata objects
 */
export async function listFilesWithPrefix(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = getS3Client();
  const bucketName = getBucketName();
  const results: Array<{ key: string; size: number; lastModified: Date }> = [];
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const listResponse = await client.send(listCommand);

    if (listResponse.Contents) {
      for (const object of listResponse.Contents) {
        if (object.Key && object.Size && object.Size > 0) {
          results.push({
            key: object.Key,
            size: object.Size,
            lastModified: object.LastModified || new Date(),
          });
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return results;
}

/**
 * Delete all files under a given prefix from R2 storage.
 * Used to clean up all files for a video project (e.g., {userId}/{videoId}/).
 * 
 * @param prefix - The prefix (folder path) to delete all files from
 * @returns Object with count of deleted files and any errors encountered
 */
export async function deleteFilesWithPrefix(prefix: string): Promise<{ deleted: number; errors: string[] }> {
  const client = getS3Client();
  const bucketName = getBucketName();
  
  let deleted = 0;
  const errors: string[] = [];
  let continuationToken: string | undefined;
  
  try {
    // List and delete files in batches
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      
      const listResponse = await client.send(listCommand);
      
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            try {
              await deleteFile(object.Key);
              deleted++;
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              errors.push(`Failed to delete ${object.Key}: ${errorMessage}`);
            }
          }
        }
      }
      
      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to list objects with prefix ${prefix}: ${errorMessage}`);
  }
  
  return { deleted, errors };
}

/**
 * Extract the storage key from a public URL.
 * Removes the base URL part.
 * @param url - The full public URL
 * @returns The storage key
 */
export function getKeyFromUrl(url: string): string {
  try {
    const baseUrl = getPublicBaseUrl();
    if (url.startsWith(baseUrl)) {
      let key = url.substring(baseUrl.length);
      if (key.startsWith('/')) key = key.substring(1);
      return key;
    }
    // Handle case where URL might be relative or different
    // Attempt to extract path from URL object if possible
    const urlObj = new URL(url);
    // Remove leading slash from pathname
    return urlObj.pathname.substring(1);
  } catch (_e) {
    // If URL parsing fails or other error, return original as fallback
    // assuming it might be the key itself
    return url;
  }
}
