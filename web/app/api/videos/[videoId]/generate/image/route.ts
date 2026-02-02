/**
 * Generate Image API Route
 * ============================================================================
 * POST /api/videos/[videoId]/generate/image
 * 
 * Production endpoint for AI image generation via GPU.
 * Creates a task, queues to gpuImageCreateQueue, and returns taskId.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { gpuImageCreateQueue } from "@/lib/queues";

interface GenerateImageRequest {
  shotIndex: number;
  prompt: string;
  aspectRatio?: "16:9" | "9:16";
  loraName?: string;
  loraWeight?: number;
  seed?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing videoId param" },
        { status: 400 }
      );
    }

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

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GenerateImageRequest = await request.json();
    const { shotIndex, prompt, aspectRatio = "16:9", loraName, loraWeight, seed } = body;

    if (shotIndex === undefined || !prompt) {
      return NextResponse.json(
        { error: "shotIndex and prompt are required" },
        { status: 400 }
      );
    }

    // Initialize service role client for DB operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify video ownership
    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, user_id, metadata")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log(`[GenerateImage] Creating image for video ${videoId}, shot ${shotIndex}`);

    // Create task record
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "video",
        name: `Generate Image: Shot ${shotIndex + 1}`,
        status: "pending",
        steps: [],
        input_data: {
          videoId,
          shotIndex,
          prompt,
          aspectRatio,
          loraName,
          loraWeight,
          seed,
          generationType: "shot_image",
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GenerateImage] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Queue job for GPU processing
    const job = await gpuImageCreateQueue.add(
      "shot-image-create",
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        shotIndex,
        prompt,
        aspectRatio,
        numInferenceSteps: 8,
        seed,
        lora_name: loraName,
        lora_weight: loraWeight,
      },
      { jobId: task.id }
    );

    console.log(`[GenerateImage] Queued job ${job.id} for task ${task.id}`);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
      shotIndex,
    });
  } catch (error) {
    console.error("[GenerateImage] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
