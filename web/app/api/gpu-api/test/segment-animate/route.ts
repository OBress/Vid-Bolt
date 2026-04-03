import { NextRequest, NextResponse } from "next/server";
import { gpuSegmentAnimateQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/segment-animate
 * 
 * Triggers animated segmentation test via BullMQ (SAM 3.1).
 * Segments objects in an image, then renders animated effects to produce an MP4.
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
      durationSeconds,
      fps,
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

    // Operations are required for animate
    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json(
        { error: "At least one operation is required for animation" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating animated segmentation task for: ${textPrompt?.substring(0, 50) || 'point/box prompts'} (${durationSeconds || 3}s @ ${fps || 30}fps)`);

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
        name: `GPU Test: Animated Segmentation (SAM 3.1)`,
        status: "pending",
        steps: [],
        input_data: {
          inputImageUrl, textPrompt, pointPrompts, boxPrompts,
          boxPromptsLabeled, objectPrompts, confidenceThreshold, maxObjects,
          durationSeconds, fps, operations,
          testType: 'animated_segmentation',
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuSegmentAnimateQueue.add('segment-animate', {
      taskId: task.id,
      userId: user.id,
      inputImageUrl,
      textPrompt: textPrompt || undefined,
      pointPrompts: pointPrompts || undefined,
      boxPrompts: boxPrompts || undefined,
      boxPromptsLabeled: boxPromptsLabeled || undefined,
      objectPrompts: hasObjectPrompts ? objectPrompts : undefined,
      confidenceThreshold: confidenceThreshold ?? undefined,
      maxObjects: maxObjects || undefined,
      durationSeconds: durationSeconds || undefined,
      fps: fps || undefined,
      operations,
    }, { jobId: task.id });

    console.log(`[GPUApiTest] Triggered animated segmentation test for task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] Animated segmentation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
