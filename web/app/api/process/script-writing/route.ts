import { NextRequest, NextResponse } from "next/server";
import { scriptWritingQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { processLimiter } from "@/lib/utils/rate-limiters";
import { resolveWritingConfig } from "@/lib/script-config";

// POST /api/process/script-writing - Start a script writing task
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
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = processLimiter.check(user.id);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { videoId, scriptOverrides, scriptAdvanced } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing required field: videoId" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, idea, metadata, project_id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const metadata = (video.metadata as Record<string, any>) || {};
    const outlineOutput = metadata.outlineOutput;
    const outlineConfig = metadata.outlineConfig || {};

    if (!outlineOutput || !outlineOutput.spine) {
      return NextResponse.json(
        { error: "Outline not found. Please complete Step 1 first." },
        { status: 400 },
      );
    }

    let projectSettings: Record<string, any> | null = null;
    if (video.project_id) {
      const { data: settingsRow } = await supabase
        .from("project_settings")
        .select("settings")
        .eq("project_id", video.project_id)
        .maybeSingle();

      projectSettings = (settingsRow?.settings as Record<string, any>) || null;
    }

    const legacyAdvanced = scriptAdvanced
      ? {
          advanced: {
            bannedPhrases: scriptAdvanced.bannedPhrases,
            wordReplacements: scriptAdvanced.wordReplacements,
            systemPrompts: scriptAdvanced.systemPrompts,
            engagementTiming: scriptAdvanced.engagementTiming,
          },
        }
      : null;

    const mergedOverrides = {
      ...legacyAdvanced,
      ...scriptOverrides,
      advanced: {
        ...(legacyAdvanced?.advanced || {}),
        ...(scriptOverrides?.advanced || {}),
      },
    };

    const resolvedConfig = resolveWritingConfig({
      topic: outlineConfig.topic || video.idea || "Untitled Video",
      genre: outlineConfig.genre || "documentary",
      researchToggle: outlineConfig.researchToggle,
      angle: outlineConfig.angle,
      sourcePreferences: outlineConfig.sourcePreferences,
      projectSettings: projectSettings as any,
      overrides: mergedOverrides,
    });

    const taskConfig = {
      topic: resolvedConfig.topic,
      genre: resolvedConfig.genre,
      angle: resolvedConfig.angle,
      toneStyle: resolvedConfig.toneStyle,
      targetAudience: resolvedConfig.targetAudience,
      pov: resolvedConfig.pov,
      protagonistGender: resolvedConfig.protagonistGender,
      openrouterModel: resolvedConfig.openrouterModel,
      qualityReviewModel: resolvedConfig.qualityReviewModel,
      contentNiche: resolvedConfig.contentNiche,
      styleConfig: resolvedConfig.styleConfig,
    };

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "script_writing",
        name: `Script: ${resolvedConfig.topic.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: {
          videoId,
          outlineData: outlineOutput,
          config: taskConfig,
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create script-writing task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await scriptWritingQueue.add(
      "script-writing",
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        outlineData: outlineOutput,
        config: taskConfig,
      },
      {
        jobId: task.id,
      },
    );

    return NextResponse.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
      task,
    });
  } catch (error) {
    console.error("Failed to start script-writing task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
