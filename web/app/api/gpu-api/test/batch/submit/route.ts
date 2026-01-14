import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import {
  generatePresignedPutUrl,
  generateGpuTestKey,
  isR2Configured,
} from "@/lib/services/r2-storage";
import {
  callGpuBatchImageGenerate,
  callGpuBatchImageEdit,
  callGpuBatchVideoGenerate,
  type BatchImageGenerateItem,
  type BatchImageEditItem,
  type BatchVideoGenerateItem,
  type AspectRatio,
} from "@/lib/services/gpu-api-service";

// Placeholder image URL for testing
const PLACEHOLDER_IMAGE_URL = "https://picsum.photos/1920/1080";

/**
 * POST /api/gpu-api/test/batch/submit
 *
 * Submit a batch of jobs directly to the GPU API.
 * Groups jobs by type and generates presigned URLs for each item.
 */
export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
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

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate R2 configuration
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "R2 storage is not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { type, items } = body as {
      type: "image" | "image-edit" | "video" | "ltx2";
      items: Array<{
        prompt: string;
        aspectRatio?: string;
        width?: number;
        height?: number;
        seed?: number;
        numInferenceSteps?: number;
        lora?: string;
        sourceImageUrl?: string;
        maskImageUrl?: string;
        input_image_url?: string;
        negative_prompt?: string;
        duration_seconds?: number;
        frame_rate?: number;
        end_image_url?: string;
        enhance_prompt?: boolean;
      }>;
    };

    if (!type || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: type and items array required" },
        { status: 400 }
      );
    }

    // Validate batch size limits
    const maxItems = type === "video" || type === "ltx2" ? 100 : 500;
    if (items.length > maxItems) {
      return NextResponse.json(
        { error: `Batch size exceeds limit (max ${maxItems} for ${type})` },
        { status: 400 }
      );
    }

    const batchId = `batch-${uuidv4()}`;
    console.log(
      `[GPUApiTest] Processing batch ${batchId}: ${items.length} ${type} items`
    );

    // Generate presigned URLs for all items
    const itemsWithUrls = await Promise.all(
      items.map(async (item, index) => {
        const isVideo = type === "video" || type === "ltx2";
        const extension = isVideo ? "mp4" : "png";
        const mimeType = isVideo ? "video/mp4" : "image/png";
        const key = generateGpuTestKey(user.id, isVideo ? "video" : "image", extension);
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, mimeType);
        return { ...item, putUrl, publicUrl, key, index };
      })
    );

    let result;

    // Submit batch based on type
    switch (type) {
      case "image": {
        const batchItems: BatchImageGenerateItem[] = itemsWithUrls.map(
          (item) => ({
            prompt: item.prompt,
            aspect_ratio: (item.aspectRatio as AspectRatio) || "16:9",
            width:
              item.width || (item.aspectRatio === "9:16" ? 1080 : 1920),
            height:
              item.height || (item.aspectRatio === "9:16" ? 1920 : 1080),
            seed: item.seed,
            num_inference_steps: item.numInferenceSteps || 8,
            lora_name: item.lora,
            save_url: item.putUrl,
          })
        );
        result = await callGpuBatchImageGenerate(batchId, batchItems);
        break;
      }

      case "image-edit": {
        const batchItems: BatchImageEditItem[] = itemsWithUrls.map((item) => ({
          input_image_url: item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
          prompt: item.prompt,
          aspect_ratio: (item.aspectRatio as AspectRatio) || "16:9",
          mask_image_url: item.maskImageUrl,
          seed: item.seed,
          save_url: item.putUrl,
        }));
        result = await callGpuBatchImageEdit(batchId, batchItems);
        break;
      }

      case "video":
      case "ltx2": {
        const batchItems: BatchVideoGenerateItem[] = itemsWithUrls.map(
          (item) => ({
            input_image_url: item.input_image_url || item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
            prompt: item.prompt,
            negative_prompt: item.negative_prompt,
            duration_seconds: item.duration_seconds || 5.0,
            frame_rate: item.frame_rate || 24.0,
            aspect_ratio: (item.aspectRatio as AspectRatio) || "16:9",
            width:
              item.width || (item.aspectRatio === "9:16" ? 1080 : 1920),
            height:
              item.height || (item.aspectRatio === "9:16" ? 1920 : 1080),
            end_image_url: item.end_image_url,
            seed: item.seed,
            enhance_prompt: item.enhance_prompt || false,
            save_url: item.putUrl,
          })
        );
        result = await callGpuBatchVideoGenerate(batchId, batchItems);
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unsupported batch type: ${type}` },
          { status: 400 }
        );
    }

    if (!result.success) {
      console.error(`[GPUApiTest] Batch submission failed:`, result.errorMessage);
      return NextResponse.json(
        { error: result.errorMessage || "Batch submission failed" },
        { status: 500 }
      );
    }

    console.log(`[GPUApiTest] Batch ${batchId} submitted successfully`);

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      totalItems: result.totalItems,
      statusUrl: result.statusUrl,
      // Return public URLs mapped by index for result retrieval
      itemUrls: itemsWithUrls.map((item) => ({
        index: item.index,
        publicUrl: item.publicUrl,
        key: item.key,
      })),
    });
  } catch (error) {
    console.error("[GPUApiTest] Batch submission error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
