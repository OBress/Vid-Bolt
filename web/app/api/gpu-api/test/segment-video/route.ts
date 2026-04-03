import { NextRequest, NextResponse } from "next/server";
import { gpuSegmentVideoQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/segment-video
 * 
 * Triggers video segmentation/object tracking test via BullMQ (SAM 3.1).
 * Supports legacy single text prompt mode, multi-text prompt mode, and named object prompts.
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
      inputVideoUrl,
      textPrompt,
      textPrompts,
      pointPrompts,
      pointLabels,
      boxPrompts,
      boxLabels,
      objectPrompts,
      promptFrameIndex,
      propagationDirection,
      confidenceThreshold,
      includeTrackingMetadata,
      outputFormat,
      operations,
      maxFrames,
    } = body;

    if (!inputVideoUrl || typeof inputVideoUrl !== 'string') {
      return NextResponse.json(
        { error: "inputVideoUrl is required" },
        { status: 400 }
      );
    }

    // Exactly one prompt mode must be provided.
    const hasTextPrompt = textPrompt && typeof textPrompt === 'string' && textPrompt.trim().length > 0;
    const hasTextPrompts = Array.isArray(textPrompts) && textPrompts.some((prompt) => typeof prompt === 'string' && prompt.trim().length > 0);
    const hasPointPrompts = Array.isArray(pointPrompts) && pointPrompts.length > 0;
    const hasBoxPrompts = Array.isArray(boxPrompts) && boxPrompts.length > 0;
    const hasObjectPrompts = Array.isArray(objectPrompts) && objectPrompts.length > 0;

    const promptModeCount = [hasTextPrompt, hasTextPrompts, hasObjectPrompts].filter(Boolean).length;
    if (promptModeCount !== 1) {
      return NextResponse.json(
        { error: "Exactly one of textPrompt, textPrompts, or objectPrompts is required" },
        { status: 400 }
      );
    }

    if ((hasPointPrompts || hasBoxPrompts) && !hasTextPrompt) {
      return NextResponse.json(
        { error: "pointPrompts and boxPrompts are only supported with the legacy single textPrompt video mode" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating video segmentation task for: ${textPrompt?.substring(0, 50) || (hasTextPrompts ? 'multi-text prompts' : 'object prompts')} (output: ${outputFormat || 'masks_json'})`);

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
        name: `GPU Test: Video Segmentation (SAM 3)`,
        status: "pending",
        steps: [],
        input_data: {
          inputVideoUrl, textPrompt, textPrompts, pointPrompts, pointLabels,
          boxPrompts, boxLabels, objectPrompts, promptFrameIndex, propagationDirection,
          confidenceThreshold, includeTrackingMetadata, outputFormat, operations, maxFrames,
          testType: 'video_segmentation',
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuSegmentVideoQueue.add('segment-video', {
      taskId: task.id,
      userId: user.id,
      inputVideoUrl,
      textPrompt: textPrompt || undefined,
      textPrompts: hasTextPrompts ? textPrompts.filter((prompt: string) => prompt.trim().length > 0) : undefined,
      pointPrompts: pointPrompts || undefined,
      pointLabels: pointLabels || undefined,
      boxPrompts: boxPrompts || undefined,
      boxLabels: boxLabels || undefined,
      objectPrompts: hasObjectPrompts ? objectPrompts : undefined,
      promptFrameIndex: promptFrameIndex ?? undefined,
      propagationDirection: propagationDirection || undefined,
      confidenceThreshold: confidenceThreshold ?? undefined,
      includeTrackingMetadata: includeTrackingMetadata ?? undefined,
      outputFormat: outputFormat || undefined,
      operations: operations || undefined,
      maxFrames: maxFrames || undefined,
    }, { jobId: task.id });

    console.log(`[GPUApiTest] Triggered video segmentation test for task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] Video segmentation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
