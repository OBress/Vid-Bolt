import { NextRequest, NextResponse } from "next/server";
import { orchestratorQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { buildCreativeManifest } from "@/lib/services/manifest-builder";
import type { ProjectSettings } from "@/types/settings";

/**
 * POST /api/process/closed-loop
 * 
 * Triggers the closed-loop orchestrator pipeline for a video project.
 * The orchestrator handles TTS, Shot Planning, Asset Retrieval, Production, and Assembly.
 * 
 * Requires: completed script in video_projects.script_content
 * 
 * Request body:
 *   - videoId: string (required)
 *   - videoCreativeOverrides?: VideoCreativeOverrides (optional per-video customization)
 * 
 * The CreativeManifest is built from three layers:
 *   1. System defaults (sensible fallbacks)
 *   2. Channel-level creative direction (from project_settings.visuals.creativeDirection)
 *   3. Per-video overrides (from request body.videoCreativeOverrides)
 * 
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
    const { videoId, videoCreativeOverrides } = body;

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

    // Fetch video project with script, metadata, and parent project ID
    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, name, idea, script_content, metadata, project_id")
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

    // Fetch channel-level creative direction from project settings
    let channelDefaults: import("@/types/settings").CreativeDirectionDefaults | undefined;
    if (video.project_id) {
      const { data: settingsRow } = await supabase
        .from("project_settings")
        .select("settings")
        .eq("project_id", video.project_id)
        .maybeSingle();

      if (settingsRow?.settings) {
        const projectSettings = settingsRow.settings as ProjectSettings;
        channelDefaults = projectSettings.visuals?.creativeDirection;
      }
    }

    // Build CreativeManifest: system defaults → channel settings → per-video overrides
    const creativeManifest = buildCreativeManifest(
      videoId,
      outlineConfig,
      channelDefaults,
      videoCreativeOverrides,
    );

    console.log(
      `[Closed-Loop API] Built CreativeManifest for video ${videoId}:`,
      `style="${creativeManifest.style.visual_style}"`,
      `lora=${creativeManifest.lora?.name || 'none'}`,
      `pacing=${creativeManifest.editing?.pacing_preset || 'default'}`,
      `mgTheme=${creativeManifest.motion_graphics?.theme || 'default'}`,
    );

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
        videoCreativeOverrides,
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
