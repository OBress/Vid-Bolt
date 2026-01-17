import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import {
  generatePresignedPutUrl,
  generateGpuTestKey,
  isR2Configured,
} from "@/lib/services/r2-storage";
import {
  gpuImageCreateQueue,
  gpuImageEditQueue,
  gpuVideoCreateQueue,
  gpuLtx2CreateQueue,
} from "@/lib/queues";
import type { AspectRatio } from "@/lib/services/gpu-api-service";

// Placeholder image URL for testing
const PLACEHOLDER_IMAGE_URL = "https://picsum.photos/1920/1080";

/**
 * POST /api/gpu-api/test/batch/submit
 *
 * Submit a batch of jobs via BullMQ workers.
 * Each item is queued as a separate job for durability and proper webhook handling.
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
        // Video parameters - support both camelCase (frontend) and snake_case
        input_image_url?: string;
        startFrameUrl?: string;  // camelCase from frontend
        negative_prompt?: string;
        duration_seconds?: number;
        durationSeconds?: number;  // camelCase from frontend
        frame_rate?: number;
        fps?: number;  // camelCase from frontend
        end_image_url?: string;
        endFrameUrl?: string;  // camelCase from frontend
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
      `[GPUApiTest] Processing batch ${batchId}: ${items.length} ${type} items via BullMQ workers`
    );

    // Get Supabase service client for creating tasks
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate presigned URLs and queue jobs for all items
    const queuedTasks: Array<{
      index: number;
      taskId: string;
      itemId: string;
      publicUrl: string;
      key: string;
    }> = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const isVideo = type === "video" || type === "ltx2";
      const extension = isVideo ? "mp4" : "png";
      const mimeType = isVideo ? "video/mp4" : "image/png";
      const key = generateGpuTestKey(user.id, isVideo ? "video" : "image", extension);
      const { putUrl, publicUrl } = await generatePresignedPutUrl(key, mimeType);
      const itemId = `${batchId}_item_${index}`;

      // Determine task type and name - must be valid: writing, audio, video, export, universal_script
      // Using 'video' for all GPU tasks since they're media generation
      const taskType = "video";
      const taskName = `${type === "video" || type === "ltx2" ? "Video" : type === "image-edit" ? "Image Edit" : "Image"} Generation (Batch ${index + 1}/${items.length})`;

      // Create task in Supabase
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          name: taskName,
          type: taskType,
          status: "pending",
          current_phase: type === "video" || type === "ltx2" ? "video_generation" : type === "image-edit" ? "image_editing" : "image_generation",
          current_step: `Queued (${index + 1}/${items.length})`,
          progress_percent: 0,
          input_data: {
            batchId,
            itemIndex: index,
            prompt: item.prompt,
            aspectRatio: item.aspectRatio,
            width: item.width,
            height: item.height,
            seed: item.seed,
            // Video-specific parameters
            startFrameUrl: item.startFrameUrl || item.input_image_url || item.sourceImageUrl,
            endFrameUrl: item.endFrameUrl || item.end_image_url,
            durationSeconds: item.durationSeconds || item.duration_seconds,
            fps: item.fps || item.frame_rate,
          },
        })
        .select()
        .single();

      if (taskError || !task) {
        console.error(`[GPUApiTest] Failed to create task for item ${index}:`, taskError);
        continue; // Skip this item but continue with others
      }

      // Queue job based on type
      const commonJobData = {
        taskId: task.id,
        userId: user.id,
        batchId,
        itemIndex: index,
        prompt: item.prompt,
        aspectRatio: (item.aspectRatio as AspectRatio) || "16:9",
        width: item.width || (item.aspectRatio === "9:16" ? 1080 : 1920),
        height: item.height || (item.aspectRatio === "9:16" ? 1920 : 1080),
        seed: item.seed,
        r2Key: key,
        putUrl,
        publicUrl,
      };

      try {
        switch (type) {
          case "image":
            await gpuImageCreateQueue.add(`batch-${batchId}-${index}`, {
              ...commonJobData,
              numInferenceSteps: item.numInferenceSteps || 8,
              lora_name: item.lora,
            });
            break;

          case "image-edit":
            await gpuImageEditQueue.add(`batch-${batchId}-${index}`, {
              ...commonJobData,
              sourceImageUrl: item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
              maskImageUrl: item.maskImageUrl,
            });
            break;

          case "video":
            await gpuVideoCreateQueue.add(`batch-${batchId}-${index}`, {
              ...commonJobData,
              startFrameUrl: item.startFrameUrl || item.input_image_url || item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
              endFrameUrl: item.endFrameUrl || item.end_image_url,
              durationSeconds: item.durationSeconds || item.duration_seconds || 5.0,
              fps: item.fps || item.frame_rate || 24,
            });
            break;

          case "ltx2":
            await gpuLtx2CreateQueue.add(`batch-${batchId}-${index}`, {
              ...commonJobData,
              sourceImageUrl: item.startFrameUrl || item.input_image_url || item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
              negativePrompt: item.negative_prompt,
              endImageUrl: item.endFrameUrl || item.end_image_url,
              durationSeconds: item.durationSeconds || item.duration_seconds || 5.0,
              frameRate: item.fps || item.frame_rate || 24,
              enhancePrompt: item.enhance_prompt || false,
            });
            break;
        }

        console.log(`[GPUApiTest] Queued ${type} job for task ${task.id} to BullMQ`);

        // Update task status to pending (queued in BullMQ)
        await supabase.from("tasks").update({
          status: "pending",
          current_step: "Queued for processing",
        }).eq("id", task.id);

        queuedTasks.push({
          index,
          taskId: task.id,
          itemId,
          publicUrl,
          key,
        });

      } catch (queueError) {
        console.error(`[GPUApiTest] Failed to queue item ${index}:`, queueError);
        // Mark task as failed
        await supabase.from("tasks").update({
          status: "failed",
          current_step: "Failed to queue",
          output_data: { error: String(queueError) },
        }).eq("id", task.id);
      }
    }

    console.log(`[GPUApiTest] Queued ${queuedTasks.length}/${items.length} items from batch ${batchId}`);

    return NextResponse.json({
      success: true,
      batchId,
      totalItems: items.length,
      queuedItems: queuedTasks.length,
      // Return task IDs and URLs for each item
      tasks: queuedTasks.map((t) => ({
        index: t.index,
        taskId: t.taskId,
        itemId: t.itemId,
        publicUrl: t.publicUrl,
        key: t.key,
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
