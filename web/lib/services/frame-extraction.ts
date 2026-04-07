/**
 * Frame Extraction Utility
 * ============================================================================
 * Extracts the last frame from a generated video for continuity editing.
 *
 * Preferred path:
 *   1. Ask the GPU VM to extract the frame (when the route is available)
 *
 * Required fallback:
 *   2. Download the source clip locally
 *   3. Use FFmpeg to extract the last frame on CPU
 *   4. Upload the JPEG to R2
 *
 * This keeps frame extraction as cheap CPU-side work and allows continuity
 * editing to batch later in image-edit mode without pretending a video URL is
 * a usable frame.
 */

import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { fetchDynamicGpuApiUrl } from '@/lib/services/gpu-api-service';
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
  extractionMethod: 'gpu_api' | 'ffmpeg_local';
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

async function extractViaLocalFfmpeg(
  videoUrl: string,
  videoId: string,
  shotIndex: number,
): Promise<FrameExtractionResult> {
  const LOG_PREFIX = '[FrameExtract]';
  const tempRoot = await fs.mkdtemp(join(tmpdir(), 'vidbolt-frame-'));
  const tempVideoPath = join(tempRoot, `shot-${shotIndex}.mp4`);
  const tempFramePath = join(tempRoot, `shot-${shotIndex}.jpg`);

  try {
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: downloading video for local FFmpeg extraction`);
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
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Local FFmpeg extraction complete → ${frameUrl}`);

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
// MAIN FUNCTION
// ============================================================================

/**
 * Extract the last frame from a video and upload it to R2.
 *
 * Uses the GPU VM's FFmpeg endpoint (if available) or falls back to
 * a client-side approach using the video thumbnail.
 *
 * @param videoUrl - R2 URL of the source video
 * @param videoId - Project ID for R2 path organization
 * @param shotIndex - Shot index for naming
 */
export async function extractLastFrame(
  videoUrl: string,
  videoId: string,
  shotIndex: number
): Promise<FrameExtractionResult> {
  const LOG_PREFIX = '[FrameExtract]';

  console.log(`${LOG_PREFIX} Extracting last frame from shot ${shotIndex}: ${videoUrl}`);

  // Strategy: Call the GPU VM's frame extraction endpoint
  // The GPU VM has FFmpeg installed and can extract frames quickly
  const gpuApiUrl = await fetchDynamicGpuApiUrl();

  if (!gpuApiUrl || gpuApiUrl === 'http://localhost:8000') {
    console.warn(`${LOG_PREFIX} No GPU VM extraction route available — using local FFmpeg fallback`);
    return extractViaLocalFfmpeg(videoUrl, videoId, shotIndex);
  }

  try {
    const response = await fetch(`${gpuApiUrl}/api/extract-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GPU_API_SECRET || ''}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        position: 'last', // Extract the last frame
        output_format: 'jpeg',
        quality: 95,
        // R2 upload config
        upload: {
          bucket: process.env.R2_BUCKET_NAME || 'vid-bolt-media',
          key: `projects/${videoId}/frames/shot-${shotIndex}-lastframe-${uuidv4().slice(0, 8)}.jpg`,
        },
      }),
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Frame extraction API error: ${response.status} — ${errText.substring(0, 200)}`);
    }

    const result = await response.json();

    if (!result.frame_url) {
      throw new Error('No frame_url in extraction response');
    }

    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Last frame extracted → ${result.frame_url}`);

    return {
      frameUrl: result.frame_url,
      width: result.width || 1920,
      height: result.height || 1080,
      sourceVideoUrl: videoUrl,
      extractionMethod: 'gpu_api',
    };

  } catch (error) {
    console.error(`${LOG_PREFIX} Frame extraction failed for shot ${shotIndex}:`, error);
    console.warn(`${LOG_PREFIX} Falling back to local FFmpeg extraction`);
    return extractViaLocalFfmpeg(videoUrl, videoId, shotIndex);
  }
}

// ============================================================================
// STATIC VIDEO DETECTION (SSIM)
// ============================================================================
// STATIC VIDEO DETECTION — REMOVED
// ============================================================================
// The SSIM-based static video detection system has been removed.
// The GPU API endpoint (/api/frame-similarity) was never deployed, and
// the VLM-based verifier already catches genuinely bad/static media.
// See implementation_plan.md C1 for context.


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
  sameScene?: boolean
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
