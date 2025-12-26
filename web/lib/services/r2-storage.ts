/**
 * R2 Storage Service
 * ============================================================================
 * Cloudflare R2 storage service using the S3-compatible API.
 * Used for storing TTS audio files and other media assets.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client for R2
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 configuration. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
}

function getBucketName(): string {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("Missing R2_BUCKET_NAME environment variable");
  }
  return bucketName;
}

function getPublicBaseUrl(): string {
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

/**
 * Generate a unique storage key for audio files.
 * 
 * @param userId - User ID
 * @param videoId - Video project ID
 * @param chunkIndex - Index of the audio chunk
 * @param extension - File extension (default: mp3)
 * @returns Storage key
 */
export function generateAudioKey(
  userId: string,
  videoId: string,
  chunkIndex: number,
  extension: string = "mp3"
): string {
  const timestamp = Date.now();
  return `audio/${userId}/${videoId}/${timestamp}_chunk_${chunkIndex.toString().padStart(3, "0")}.${extension}`;
}

/**
 * Generate storage key for final merged audio.
 */
export function generateFinalAudioKey(
  userId: string,
  videoId: string,
  extension: string = "mp3"
): string {
  const timestamp = Date.now();
  return `audio/${userId}/${videoId}/${timestamp}_final.${extension}`;
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
 * Check if R2 is configured.
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}
