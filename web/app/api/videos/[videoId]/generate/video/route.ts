/**
 * Generate Video API Route
 * ============================================================================
 * POST /api/videos/[videoId]/generate/video
 * 
 * Production endpoint for AI video generation via LTX-2.
 * Requires a keyframe image URL. Creates task and queues to gpuLtx2Queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { gpuLtx2CreateQueue } from "@/lib/queues";

interface GenerateVideoRequest {
  shotIndex: number;
  prompt: string;
  keyframeUrl: string;
  aspectRatio?: "16:9" | "9:16";
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

    const body: GenerateVideoRequest = await request.json();
    const { shotIndex, prompt, keyframeUrl, aspectRatio = "16:9", seed } = body;

    if (shotIndex === undefined || !prompt || !keyframeUrl) {
      return NextResponse.json(
        { error: "shotIndex, prompt, and keyframeUrl are required" },
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

    console.log(`[GenerateVideo] Creating video for video ${videoId}, shot ${shotIndex}`);

    // Create task record
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "video",
        name: `Generate Video: Shot ${shotIndex + 1}`,
        status: "pending",
        steps: [],
        input_data: {
          videoId,
          shotIndex,
          prompt,
          keyframeUrl,
          aspectRatio,
          seed,
          generationType: "shot_video",
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GenerateVideo] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Queue job for GPU processing
    const job = await gpuLtx2CreateQueue.add(
      "shot-video-create",
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        shotIndex,
        prompt,
        imageUrl: keyframeUrl,
        aspectRatio,
        seed,
      },
      { jobId: task.id }
    );

    console.log(`[GenerateVideo] Queued job ${job.id} for task ${task.id}`);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
      shotIndex,
    });
  } catch (error) {
    console.error("[GenerateVideo] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
