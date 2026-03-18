import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
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
} from "@/lib/queues";
import type {
  AspectRatio,
  BatchVideoGenerateItem,
} from "@/lib/services/gpu-api-service";
import {
  getImageDimensions,
  getVideoDimensions,
  callGpuBatchVideoGenerate,
} from "@/lib/services/gpu-api-service";

// Placeholder image URL for testing
const PLACEHOLDER_IMAGE_URL = "https://picsum.photos/1920/1080";

// Get webhook configuration from environment (same as pipeline)
const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || "http://localhost:3000/api/gpu-callback";
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

/**
 * POST /api/gpu-api/test/batch/submit
 *
 * Submit a batch of jobs.
 * 
 * IMAGE / IMAGE-EDIT: Queued as individual BullMQ jobs (same as before).
 * VIDEO / LTX2: Submitted via callGpuBatchVideoGenerate() which calls
 *   POST /api/v1/batch/video/generate — the exact same endpoint and method
 *   used by the video creation pipeline in gpu-batch-generation.ts.
 *   This ensures the tester reproduces real batch concurrency behavior.
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
        startFrameUrl?: string;
        negative_prompt?: string;
        duration_seconds?: number;
        durationSeconds?: number;
        frame_rate?: number;
        fps?: number;
        end_image_url?: string;
        endFrameUrl?: string;
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

    // Get Supabase service client for creating tasks
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const supabase = createClient<any>(supabaseUrl, supabaseKey);

    // =========================================================================
    // VIDEO / LTX2: Use GPU batch API directly (matches pipeline exactly)
    // =========================================================================
    if (type === "video" || type === "ltx2") {
      return await handleVideoBatch(
        supabase,
        user.id,
        batchId,
        type,
        items,
      );
    }

    // =========================================================================
    // IMAGE / IMAGE-EDIT: Queue as individual BullMQ jobs (unchanged)
    // =========================================================================
    return await handleImageBatch(
      supabase,
      user.id,
      batchId,
      type,
      items,
    );
  } catch (error) {
    console.error("[GPUApiTest] Batch submission error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// =============================================================================
// VIDEO BATCH — calls callGpuBatchVideoGenerate() (same as pipeline)
// =============================================================================

async function handleVideoBatch(
  supabase: SupabaseClient<any>,
  userId: string,
  batchId: string,
  type: "video" | "ltx2",
  items: Array<Record<string, any>>,
) {
  const webhookUrl = getWebhookUrl();
  const webhookSecret = getWebhookSecret();

  console.log(
    `[GPUApiTest] Submitting ${items.length} ${type} items via GPU batch API (POST /api/v1/batch/video/generate)`
  );

  // Build BatchVideoGenerateItem[] — matching the pipeline's processVideoBatch()
  const batchItems: BatchVideoGenerateItem[] = [];
  const queuedTasks: Array<{
    index: number;
    taskId: string;
    itemId: string;
    publicUrl: string;
    key: string;
  }> = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = generateGpuTestKey(userId, "video", "mp4");
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, "video/mp4");
    const itemId = `${batchId}_item_${index}`;
    const ar = (item.aspectRatio as AspectRatio) || "16:9";
    const vidDims = getVideoDimensions(ar);

    // Create Supabase task for UI tracking/polling
    const taskName = `Video Generation (Batch ${index + 1}/${items.length})`;
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        name: taskName,
        type: "video",
        status: "pending",
        current_phase: "video_generation",
        current_step: `Queued (${index + 1}/${items.length})`,
        progress_percent: 0,
        input_data: {
          batchId,
          gpuBatchId: batchId,  // Flag: batch was submitted to GPU API directly
          itemIndex: index,
          prompt: item.prompt,
          aspectRatio: ar,
          startFrameUrl: item.startFrameUrl || item.input_image_url || item.sourceImageUrl,
          endFrameUrl: item.endFrameUrl || item.end_image_url,
          durationSeconds: item.durationSeconds || item.duration_seconds,
          fps: item.fps || item.frame_rate,
        },
      })
      .select()
      .single();

    if (taskError || !task) {
      console.error(`[GPUApiTest] Failed to create task for video item ${index}:`, taskError);
      continue;
    }

    // Build the batch item matching BatchVideoGenerateItem interface
    // Use task.id as item_id so webhooks update the correct Supabase task
    const startFrameUrl =
      item.startFrameUrl || item.input_image_url || item.sourceImageUrl || PLACEHOLDER_IMAGE_URL;

    batchItems.push({
      item_id: task.id,  // Webhook will match on this to update Supabase
      start_frame_url: startFrameUrl,
      prompt: item.prompt,
      negative_prompt: item.negative_prompt || undefined,
      duration_seconds: item.durationSeconds || item.duration_seconds || 5.0,
      frame_rate: item.fps || item.frame_rate || 24,
      aspect_ratio: ar,
      width: item.width || vidDims.width,
      height: item.height || vidDims.height,
      end_frame_url: item.endFrameUrl || item.end_image_url || undefined,
      seed: item.seed || undefined,
      enhance_prompt: item.enhance_prompt || false,
      save_url: putUrl,
    });

    queuedTasks.push({
      index,
      taskId: task.id,
      itemId,
      publicUrl,
      key,
    });
  }

  if (batchItems.length === 0) {
    return NextResponse.json(
      { error: "No valid items to submit" },
      { status: 400 }
    );
  }

  // Submit the batch to GPU API — the exact same call the pipeline uses
  const submitResult = await callGpuBatchVideoGenerate(
    batchId,
    batchItems,
    webhookUrl,
    webhookSecret,
  );

  if (!submitResult.success) {
    console.error(`[GPUApiTest] GPU batch submission failed: ${submitResult.errorMessage}`);
    // Mark all tasks as failed
    for (const t of queuedTasks) {
      await supabase.from("tasks").update({
        status: "failed",
        current_step: "GPU batch submission failed",
        output_data: {
          success: false,
          type: "video",
          error: submitResult.errorMessage || "Batch submission failed",
        },
      }).eq("id", t.taskId);
    }

    return NextResponse.json({
      success: false,
      error: submitResult.errorMessage || "GPU batch submission failed",
      batchId,
    }, { status: 500 });
  }

  console.log(
    `[GPUApiTest] ✅ GPU batch ${batchId} submitted: ${batchItems.length} videos via POST /api/v1/batch/video/generate`
  );

  // Update tasks to reflect they're now processing on the GPU
  for (const t of queuedTasks) {
    await supabase.from("tasks").update({
      status: "running",
      current_step: "Processing on GPU (batch)",
      progress_percent: 10,
    }).eq("id", t.taskId);
  }

  return NextResponse.json({
    success: true,
    batchId,
    totalItems: items.length,
    queuedItems: queuedTasks.length,
    submissionMethod: "gpu_batch_api",  // Flag for the frontend
    gpuBatchEndpoint: "POST /api/v1/batch/video/generate",
    tasks: queuedTasks.map((t) => ({
      index: t.index,
      taskId: t.taskId,
      itemId: t.itemId,
      publicUrl: t.publicUrl,
      key: t.key,
    })),
    // Return itemUrls for backward compat with frontend batch tracking
    itemUrls: queuedTasks.map((t) => ({
      index: t.index,
      publicUrl: t.publicUrl,
      key: t.key,
    })),
  });
}

// =============================================================================
// IMAGE BATCH — queues individual BullMQ jobs (unchanged from original)
// =============================================================================

async function handleImageBatch(
  supabase: SupabaseClient<any>,
  userId: string,
  batchId: string,
  type: "image" | "image-edit",
  items: Array<Record<string, any>>,
) {
  console.log(
    `[GPUApiTest] Queuing ${items.length} ${type} items via BullMQ workers`
  );

  const queuedTasks: Array<{
    index: number;
    taskId: string;
    itemId: string;
    publicUrl: string;
    key: string;
  }> = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const extension = "png";
    const mimeType = "image/png";
    const key = generateGpuTestKey(userId, "image", extension);
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, mimeType);
    const itemId = `${batchId}_item_${index}`;

    const taskType = "video"; // Must be valid task type
    const taskName = `${type === "image-edit" ? "Image Edit" : "Image"} Generation (Batch ${index + 1}/${items.length})`;

    // Create task in Supabase
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        name: taskName,
        type: taskType,
        status: "pending",
        current_phase: type === "image-edit" ? "image_editing" : "image_generation",
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
        },
      })
      .select()
      .single();

    if (taskError || !task) {
      console.error(`[GPUApiTest] Failed to create task for item ${index}:`, taskError);
      continue;
    }

    // Resolve dimensions
    const ar = (item.aspectRatio as AspectRatio) || "16:9";
    const dims = getImageDimensions(ar);
    const resolvedWidth = item.width || dims.width;
    const resolvedHeight = item.height || dims.height;

    const commonJobData = {
      taskId: task.id,
      userId,
      batchId,
      itemIndex: index,
      prompt: item.prompt,
      aspectRatio: ar,
      seed: item.seed,
      r2Key: key,
      putUrl,
      publicUrl,
    };

    try {
      if (type === "image") {
        await gpuImageCreateQueue.add(`batch-${batchId}-${index}`, {
          ...commonJobData,
          width: resolvedWidth,
          height: resolvedHeight,
          numInferenceSteps: item.numInferenceSteps || 8,
          lora_name: item.lora,
        });
      } else {
        await gpuImageEditQueue.add(`batch-${batchId}-${index}`, {
          ...commonJobData,
          width: resolvedWidth,
          height: resolvedHeight,
          sourceImageUrl: item.sourceImageUrl || PLACEHOLDER_IMAGE_URL,
          maskImageUrl: item.maskImageUrl,
        });
      }

      console.log(`[GPUApiTest] Queued ${type} job for task ${task.id} to BullMQ`);

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
    submissionMethod: "bullmq_individual",
    tasks: queuedTasks.map((t) => ({
      index: t.index,
      taskId: t.taskId,
      itemId: t.itemId,
      publicUrl: t.publicUrl,
      key: t.key,
    })),
    itemUrls: queuedTasks.map((t) => ({
      index: t.index,
      publicUrl: t.publicUrl,
      key: t.key,
    })),
  });
}
