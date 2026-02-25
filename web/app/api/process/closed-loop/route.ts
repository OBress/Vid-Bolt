import { NextRequest, NextResponse } from "next/server";
import { orchestratorQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import type { CreativeManifest } from "@/lib/types/closed-loop";

/**
 * POST /api/process/closed-loop
 * 
 * Triggers the closed-loop orchestrator pipeline for a video project.
 * The orchestrator handles TTS, Shot Planning, Asset Retrieval, Production, and Assembly.
 * 
 * Requires: completed script in video_projects.script_content
 * Returns: { success, taskId, jobId }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
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
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    // Service client for DB operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch video project with script and metadata
    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, name, idea, script_content, metadata")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    if (!video.script_content) {
      return NextResponse.json(
        { error: "Script not found. Please complete Step 2 (Script) first." },
        { status: 400 }
      );
    }

    const metadata = (video.metadata || {}) as Record<string, any>;
    const outlineConfig = metadata?.outlineConfig;

    // Fetch GCM entities for this project
    const { data: entities } = await supabase
      .from("project_entities")
      .select("*")
      .eq("project_id", videoId);

    const gcmEntities = (entities || []).map((e: any) => ({
      entity_id: e.id,
      entity_type: e.entity_type,
      name: e.name,
      reference_url: e.reference_url || "",
      text_description: e.text_description,
      attributes: e.attributes || {},
      last_updated: new Date(e.updated_at).getTime(),
      appearance_count: e.appearance_count || 0,
    }));

    // Build a default Creative Manifest from outline config
    const creativeManifest: CreativeManifest = {
      project_id: videoId,
      style: {
        visual_style: outlineConfig?.visualStyle || "cinematic, documentary",
        color_palette: [],
        aspect_ratio: outlineConfig?.aspectRatio || "16:9",
      },
      media_weighting: {
        stock_footage: 0.3,
        ai_video: 0.4,
        motion_graphics: 0.2,
        ai_image_static: 0.1,
      },
      pacing_rules: {
        hook_duration_seconds: 15,
        hook_min_motion_graphics: 2,
        max_consecutive_static_images: 2,
        min_video_shots_per_minute: 3,
      },
      quality_thresholds: {
        max_retries: 3,
      },
    };

    // Create task in database
    const taskId = uuidv4();
    const { error: taskError } = await supabase
      .from("tasks")
      .insert({
        id: taskId,
        user_id: user.id,
        type: "closed_loop",
        name: `Production: ${video.name?.substring(0, 50) || video.idea?.substring(0, 50) || "Untitled"}`,
        status: "pending",
        steps: [],
        input_data: { videoId },
        output_data: {},
      });

    if (taskError) {
      console.error("Failed to create closed-loop task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Update video stage to production
    await supabase
      .from("video_projects")
      .update({
        current_stage: "production",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Dispatch orchestrator job
    const job = await orchestratorQueue.add(
      "closed-loop",
      {
        taskId,
        userId: user.id,
        videoId,
        creativeManifest,
        userSystemPrompt: metadata?.userSystemPrompt,
        scriptContent: video.script_content,
        entities: gcmEntities,
      },
      {
        jobId: taskId,
      }
    );

    console.log(`[Closed-Loop API] Started orchestrator for video ${videoId}, task ${taskId}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId, jobId: job.id });
  } catch (error) {
    console.error("Failed to start closed-loop pipeline:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
