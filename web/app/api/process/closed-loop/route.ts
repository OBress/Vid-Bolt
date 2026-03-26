import { NextRequest, NextResponse } from "next/server";
import { orchestratorQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { buildCreativeManifest } from "@/lib/services/manifest-builder";
import { hasAnyLocalModel } from "@/lib/constants/model-registry";
import { incrementActiveProductions, setShutdownRequested, resetActiveProductions } from "@/lib/services/gpu-production-tracker";
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
    const { videoId, videoCreativeOverrides, shutdownWhenDone } = body;

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

    // =========================================================================
    // DUPLICATE PIPELINE GUARD
    // =========================================================================
    // Prevent parallel orchestrators for the same video. If a running/pending
    // closed-loop task already exists, return its ID instead of creating a
    // duplicate. This prevents double-clicks, Retry-without-cancel, and
    // network retries from spawning competing pipelines.
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("type", "closed_loop")
      .eq("user_id", user.id)
      .in("status", ["pending", "running"])
      .filter("input_data->>videoId", "eq", videoId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingTasks && existingTasks.length > 0) {
      const existing = existingTasks[0];
      console.log(
        `[Closed-Loop API] Duplicate prevented: video ${videoId} already has active task ${existing.id} (status: ${existing.status})`
      );
      return NextResponse.json({
        success: true,
        taskId: existing.id,
        jobId: existing.id,
        deduplicated: true,
      });
    }

    const metadata = (video.metadata || {}) as Record<string, any>;
    const outlineConfig = metadata?.outlineConfig;

    // Fetch project-level settings (voice, visuals, script, etc.)
    let channelDefaults: import("@/types/settings").CreativeDirectionDefaults | undefined;
    let projectSettings: ProjectSettings | undefined;
    let parentProjectId: string | undefined;
    if (video.project_id) {
      parentProjectId = video.project_id;
      const { data: settingsRow } = await supabase
        .from("project_settings")
        .select("settings")
        .eq("project_id", video.project_id)
        .maybeSingle();

      if (settingsRow?.settings) {
        projectSettings = settingsRow.settings as ProjectSettings;
        channelDefaults = projectSettings.visuals?.creativeDirection;
      }
    }

    // Build CreativeManifest: system defaults → channel settings → per-video overrides
    // Now also passes model selection, aspect ratio fallback, and script context
    const creativeManifest = buildCreativeManifest(
      videoId,
      outlineConfig,
      channelDefaults,
      videoCreativeOverrides,
      projectSettings?.visuals
        ? {
            imageModel: projectSettings.visuals.imageModel,
            videoModel: projectSettings.visuals.videoModel,
            imageEditModel: projectSettings.visuals.imageEditModel,
          }
        : undefined,
      projectSettings?.basic_info?.aspectRatio,
      projectSettings?.script
        ? {
            pov: projectSettings.script.pov,
            genre: projectSettings.script.genre,
            toneStyle: projectSettings.script.toneStyle,
            targetAudience: projectSettings.script.targetAudience,
            contentNiche:
              projectSettings.script.contentNiche ||
              projectSettings.basic_info?.contentNiche,
          }
        : undefined,
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
        projectId: parentProjectId,
        creativeManifest,
        userSystemPrompt: metadata?.userSystemPrompt,
        scriptContent: video.script_content,
        entities: gcmEntities,
        videoCreativeOverrides,
        projectConfig: projectSettings
          ? {
              voice: projectSettings.voice,
              scriptMeta: {
                pov: projectSettings.script?.pov,
                genre: projectSettings.script?.genre,
                toneStyle: projectSettings.script?.toneStyle,
                targetAudience: projectSettings.script?.targetAudience,
                contentNiche:
                  projectSettings.script?.contentNiche ||
                  projectSettings.basic_info?.contentNiche,
              },
            }
          : undefined,
      },
      {
        jobId: taskId,
      }
    );

    console.log(`[Closed-Loop API] Started orchestrator for video ${videoId}, task ${taskId}, job ${job.id}`);

    // --- GPU production tracking ---
    // Check if project uses local GPU models
    const needsLocalGpu = projectSettings?.visuals
      ? hasAnyLocalModel(
          projectSettings.visuals.imageModel,
          projectSettings.visuals.imageEditModel,
          projectSettings.visuals.videoModel,
        )
      : false;

    if (needsLocalGpu) {
      try {
        // Safety: sync the counter with actual running BullMQ jobs before incrementing.
        // This catches stale counters from previous crashes/restarts that never decremented.
        try {
          const [activeJobs, waitingJobs] = await Promise.all([
            orchestratorQueue.getActive(),
            orchestratorQueue.getWaiting(),
          ]);
          const actualUserJobs = [...activeJobs, ...waitingJobs].filter(
            (j) => j.data?.userId === user.id
          );

          // Fetch current counter from DB
          const { data: gcpConfig } = await supabase
            .from('user_gcp_config')
            .select('active_gpu_productions')
            .eq('user_id', user.id)
            .single();

          const dbCount = gcpConfig?.active_gpu_productions ?? 0;
          // actualUserJobs doesn't include the job we just added (it's already submitted),
          // so the expected count is actualUserJobs.length (not +1)
          if (dbCount > actualUserJobs.length) {
            console.warn(
              `[Closed-Loop API] Stale GPU counter detected: DB=${dbCount}, actual BullMQ jobs=${actualUserJobs.length}. Resetting to ${actualUserJobs.length}.`
            );
            await resetActiveProductions(user.id, actualUserJobs.length);
          }
        } catch (syncErr) {
          // Non-blocking: sync failure shouldn't prevent production
          console.warn('[Closed-Loop API] Counter sync check failed (non-fatal):', syncErr);
        }

        await incrementActiveProductions(user.id);
        // Always sync the checkbox state — clears stale flags from prior runs
        await setShutdownRequested(user.id, !!shutdownWhenDone);
      } catch (trackErr) {
        // Non-blocking: tracking failure shouldn't prevent production
        console.warn('[Closed-Loop API] GPU production tracking failed (non-fatal):', trackErr);
      }
    }

    return NextResponse.json({ success: true, taskId, jobId: job.id });
  } catch (error) {
    console.error("Failed to start closed-loop pipeline:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
