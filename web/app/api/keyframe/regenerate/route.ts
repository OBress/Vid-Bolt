/**
 * Keyframe Regeneration API
 * ============================================================================
 * Triggers GPU image generation for video keyframes (start/end frames).
 * 
 * This endpoint:
 * 1. Gets presigned PUT URL for R2 storage
 * 2. Submits image generation job to GPU API
 * 3. Returns job ID for polling / webhook handling
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { v4 as uuidv4 } from "uuid";
import { 
  callGpuImageGenerate, 
  type ImageGenerateRequest,
  type AspectRatio 
} from "@/lib/services/gpu-api-service";
import { generatePresignedPutUrl } from "@/lib/services/r2-storage";

// Request body type
interface KeyframeRegenerateRequest {
  videoId: string;
  shotIndex: number;
  frameType: "start" | "end";
  prompt: string;
  loraName?: string;
  loraWeight?: number;
  seed?: number;
  aspectRatio?: "16:9" | "9:16";
}

// Response type
interface KeyframeRegenerateResponse {
  success: boolean;
  jobId?: string;
  imageUrl?: string;
  error?: string;
}

/**
 * POST /api/keyframe/regenerate
 * Generate a keyframe image for video shot
 */
export async function POST(request: NextRequest): Promise<NextResponse<KeyframeRegenerateResponse>> {
  const logPrefix = "[API keyframe/regenerate]";
  
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body: KeyframeRegenerateRequest = await request.json();
    const { 
      videoId, 
      shotIndex, 
      frameType, 
      prompt, 
      loraName, 
      loraWeight,
      seed, 
      aspectRatio = "16:9" 
    } = body;

    // Validate required fields
    if (!videoId || shotIndex === undefined || !frameType || !prompt) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: videoId, shotIndex, frameType, prompt" },
        { status: 400 }
      );
    }

    console.log(`${logPrefix} Generating ${frameType} keyframe for shot ${shotIndex} of video ${videoId}`);

    // Generate unique IDs
    const jobId = uuidv4();
    const itemId = `keyframe_${videoId}_shot${shotIndex}_${frameType}`;
    
    // R2 storage path for keyframe
    const r2Key = `videos/${videoId}/keyframes/shot${shotIndex}_${frameType}.png`;
    
    // Get presigned PUT URL for R2
    const { putUrl, publicUrl } = await generatePresignedPutUrl(r2Key, "image/png");
    
    if (!putUrl) { // Assuming generatePresignedPutUrl returns null/undefined for putUrl on error
      console.error(`${logPrefix} Failed to get presigned URL: putUrl is undefined`);
      return NextResponse.json(
        { success: false, error: "Failed to prepare storage" },
        { status: 500 }
      );
    }

    // Build GPU API request
    const gpuRequest: ImageGenerateRequest = {
      job_id: jobId,
      prompt,
      aspect_ratio: aspectRatio as AspectRatio,
      save_url: putUrl,
      item_id: itemId,
      webhook_url: `${process.env.WEBHOOK_CALLBACK_URL}/api/webhooks/gpu`,
      ...(loraName && { lora_name: loraName }),
      ...(seed !== undefined && { seed }),
    };

    console.log(`${logPrefix} Submitting to GPU API with job ${jobId}`);

    // Call GPU API
    const result = await callGpuImageGenerate(gpuRequest);

    if (!result.success) {
      console.error(`${logPrefix} GPU API failed:`, result.errorMessage);
      return NextResponse.json(
        { success: false, error: result.errorMessage || "GPU generation failed" },
        { status: 500 }
      );
    }

    // Store pending keyframe data in video metadata for webhook to update
    const serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [] } }
    );

    // Get current video metadata
    const { data: video, error: fetchError } = await serviceClient
      .from("video_projects")
      .select("metadata")
      .eq("id", videoId)
      .single();

    if (fetchError) {
      console.warn(`${logPrefix} Could not fetch video metadata:`, fetchError);
    } else {
      // Update metadata with pending keyframe job
      const metadata = (video?.metadata as Record<string, unknown>) || {};
      const pendingKeyframes = (metadata.pendingKeyframes as Record<string, unknown>) || {};
      
      pendingKeyframes[itemId] = {
        jobId,
        shotIndex,
        frameType,
        publicUrl,
        prompt,
        loraName,
        loraWeight,
        seed,
        aspectRatio,
        status: "generating",
        createdAt: new Date().toISOString(),
      };

      await serviceClient
        .from("video_projects")
        .update({
          metadata: {
            ...metadata,
            pendingKeyframes,
          },
        })
        .eq("id", videoId);
    }

    console.log(`${logPrefix} Successfully submitted job ${jobId}, public URL will be: ${publicUrl}`);

    return NextResponse.json({
      success: true,
      jobId: result.jobId || jobId,
      imageUrl: publicUrl,
    });

  } catch (error) {
    console.error(`${logPrefix} Unexpected error:`, error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
