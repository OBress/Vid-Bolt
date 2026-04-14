/**
 * Frame Extraction Utility
 * ============================================================================
 * Extracts the last frame from a generated video for continuity editing.
 *
 * Uses local FFmpeg (spawned as a child process) to extract the last frame,
 * downloads the source clip temporarily, then uploads the JPEG to R2.
 */

import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import {
  getBucketName,
  getPublicUrl,
  getS3Client,
} from '@/lib/services/r2-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface FrameExtractionResult {
  /** R2 URL of the extracted frame */
  frameUrl: string;
  /** Width of the extracted frame in pixels */
  width: number;
  /** Height of the extracted frame in pixels */
  height: number;
  /** Source video URL */
  sourceVideoUrl: string;
  /** Which extraction path produced the frame */
  extractionMethod: 'ffmpeg_local';
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Extract the last frame from a video and upload it to R2.
 *
 * Downloads the source video to a temp directory, runs FFmpeg to extract the
 * last frame, uploads the JPEG to R2, then cleans up the temp files.
 *
 * NOTE: A GPU-side /api/extract-frame endpoint could be added to the GPU API
 * in the future (GPU VM already has FFmpeg), but local FFmpeg is reliable and
 * avoids any dependency on the GPU VM being responsive.
 *
 * @param videoUrl - R2 URL of the source video
 * @param videoId - Project ID for R2 path organization
 * @param shotIndex - Shot index for naming
 */
export async function extractLastFrame(
  videoUrl: string,
  videoId: string,
  shotIndex: number,
): Promise<FrameExtractionResult> {
  const LOG_PREFIX = '[FrameExtract]';
  const tempRoot = await fs.mkdtemp(join(tmpdir(), 'vidbolt-frame-'));
  const tempVideoPath = join(tempRoot, `shot-${shotIndex}.mp4`);
  const tempFramePath = join(tempRoot, `shot-${shotIndex}.jpg`);

  try {
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: downloading video for FFmpeg extraction`);
    const response = await fetch(videoUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Video download failed: HTTP ${response.status}`);
    }

    const videoBuffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempVideoPath, videoBuffer);

    await runCommand('ffmpeg', [
      '-y',
      '-sseof',
      '-0.1',
      '-i',
      tempVideoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      tempFramePath,
    ]);

    const frameBuffer = await fs.readFile(tempFramePath);
    const key = `projects/${videoId}/frames/shot-${shotIndex}-lastframe-${uuidv4().slice(0, 8)}.jpg`;
    const client = getS3Client();
    await client.send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: frameBuffer,
      ContentType: 'image/jpeg',
    }));

    let width = 1920;
    let height = 1080;
    try {
      const probe = await runCommand('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        tempFramePath,
      ]);
      const parsed = JSON.parse(probe.stdout) as {
        streams?: Array<{ width?: number; height?: number }>;
      };
      width = parsed.streams?.[0]?.width || width;
      height = parsed.streams?.[0]?.height || height;
    } catch (probeError) {
      console.warn(`${LOG_PREFIX} Shot ${shotIndex}: ffprobe failed, using default dimensions`, probeError);
    }

    const frameUrl = getPublicUrl(key);
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: FFmpeg extraction complete → ${frameUrl}`);

    return {
      frameUrl,
      width,
      height,
      sourceVideoUrl: videoUrl,
      extractionMethod: 'ffmpeg_local',
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

// ============================================================================
// SYNTHESIS MODE
// ============================================================================

/**
 * Determine the synthesis mode for a video shot based on its context.
 *
 * @param shotIndex - Current shot index
 * @param previousShotMediaType - Media type of the previous shot
 * @param previousShotUrl - URL of the previous shot's output
 * @param entityOverlap - Whether entities from the previous shot appear in this one
 * @param sameScene - Whether this shot continues the same scene
 */
export function determineSynthesisMode(
  shotIndex: number,
  previousShotMediaType?: string,
  previousShotUrl?: string,
  entityOverlap?: boolean,
  sameScene?: boolean,
): 'T2V' | 'FF2V' {
  // First shot is always T2V (no prior frame to condition on)
  if (shotIndex === 0) return 'T2V';

  // No previous shot URL available → T2V
  if (!previousShotUrl) return 'T2V';

  // Previous shot was not a video → T2V (can't extract a frame from an image/MG)
  if (previousShotMediaType !== 'video') return 'T2V';

  // Same scene with entity overlap → FF2V for continuity
  if (sameScene && entityOverlap) return 'FF2V';

  // High entity overlap even across scenes → FF2V
  if (entityOverlap) return 'FF2V';

  // Default: fresh start with T2V
  return 'T2V';
}
