/**
 * Frame Extraction Utility
 * ============================================================================
 * Extracts the last frame from a generated video for use as a conditioning
 * anchor in FF2V (First-Frame-to-Video) synthesis mode with LTX-2.
 *
 * Flow:
 *   1. Download video from R2 URL to a temp buffer
 *   2. Use FFmpeg to extract the last frame as JPEG
 *   3. Upload the frame to R2
 *   4. Return the R2 URL for use as `start_frame_url` in LTX-2
 *
 * This is a prerequisite for sequential shot generation where temporal
 * continuity between shots is needed (FF2V mode).
 */

import { v4 as uuidv4 } from 'uuid';

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
  const gpuApiUrl = process.env.GPU_API_URL;

  if (!gpuApiUrl) {
    console.warn(`${LOG_PREFIX} GPU_API_URL not configured — returning source URL as fallback`);
    return {
      frameUrl: videoUrl,
      width: 1920,
      height: 1080,
      sourceVideoUrl: videoUrl,
    };
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
    };

  } catch (error) {
    console.error(`${LOG_PREFIX} Frame extraction failed for shot ${shotIndex}:`, error);

    // Fallback: return the video URL itself
    // The LTX-2 API can sometimes accept a video URL as the start_frame reference
    console.warn(`${LOG_PREFIX} Falling back to source video URL for FF2V conditioning`);
    return {
      frameUrl: videoUrl,
      width: 1920,
      height: 1080,
      sourceVideoUrl: videoUrl,
    };
  }
}

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
