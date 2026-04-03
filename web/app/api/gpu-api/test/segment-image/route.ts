import { NextRequest, NextResponse } from "next/server";
import { gpuSegmentImageQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/segment-image
 * 
 * Triggers image segmentation test via BullMQ (SAM 3 v0.8.1).
 * Supports text/point/box prompts, labeled boxes, confidence threshold,
 * output type (masks_json or image), and composable operations pipeline.
 */
export async function POST(request: NextRequest) {
  try {
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

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      inputImageUrl,
      textPrompt,
      pointPrompts,
      boxPrompts,
      boxPromptsLabeled,
      objectPrompts,
      confidenceThreshold,
      maxObjects,
      outputType,
      operations,
    } = body;

    if (!inputImageUrl || typeof inputImageUrl !== 'string') {
      return NextResponse.json(
        { error: "inputImageUrl is required" },
        { status: 400 }
      );
    }

    // At least one prompt type must be provided
    const hasTextPrompt = textPrompt && typeof textPrompt === 'string' && textPrompt.trim().length > 0;
    const hasPointPrompts = Array.isArray(pointPrompts) && pointPrompts.length > 0;
    const hasBoxPrompts = Array.isArray(boxPrompts) && boxPrompts.length > 0;
    const hasBoxPromptsLabeled = Array.isArray(boxPromptsLabeled) && boxPromptsLabeled.length > 0;
    const hasObjectPrompts = Array.isArray(objectPrompts) && objectPrompts.length > 0;

    if (!hasTextPrompt && !hasPointPrompts && !hasBoxPrompts && !hasBoxPromptsLabeled && !hasObjectPrompts) {
      return NextResponse.json(
        { error: "At least one prompt type is required (textPrompt, pointPrompts, boxPrompts, boxPromptsLabeled, or objectPrompts)" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating image segmentation task for: ${textPrompt?.substring(0, 50) || 'point/box prompts'} (output: ${outputType || 'masks_json'})`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "video",
        name: `GPU Test: Image Segmentation (SAM 3)`,
        status: "pending",
        steps: [],
        input_data: {
          inputImageUrl, textPrompt, pointPrompts, boxPrompts,
          boxPromptsLabeled, objectPrompts, confidenceThreshold, maxObjects,
          outputType, operations, testType: 'image_segmentation',
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuSegmentImageQueue.add('segment-image', {
      taskId: task.id,
      userId: user.id,
      inputImageUrl,
      textPrompt: textPrompt || undefined,
      pointPrompts: pointPrompts || undefined,
      boxPrompts: boxPrompts || undefined,
      boxPromptsLabeled: boxPromptsLabeled || undefined,
      objectPrompts: objectPrompts || undefined,
      confidenceThreshold: confidenceThreshold ?? undefined,
      maxObjects: maxObjects || undefined,
      outputType: outputType || undefined,
      operations: operations || undefined,
    }, { jobId: task.id });

    console.log(`[GPUApiTest] Triggered image segmentation test for task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] Image segmentation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
