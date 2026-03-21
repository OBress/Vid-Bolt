import { NextRequest, NextResponse } from "next/server";
import { outlineQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { normalizeResearchDepth, resolveWritingConfig } from "@/lib/script-config";

const VALID_GENRES = [
  "documentary",
  "educational",
  "narrative_fiction",
  "historical_fiction",
  "opinion_essay",
  "tutorial",
  "news",
] as const;

function normalizeDurationRange(
  durationRange: unknown,
): { minMinutes: number; maxMinutes: number } | null {
  if (
    durationRange &&
    typeof durationRange === "object" &&
    "minMinutes" in durationRange &&
    "maxMinutes" in durationRange
  ) {
    const minMinutes = Number((durationRange as { minMinutes: unknown }).minMinutes);
    const maxMinutes = Number((durationRange as { maxMinutes: unknown }).maxMinutes);

    if (Number.isFinite(minMinutes) && Number.isFinite(maxMinutes)) {
      return { minMinutes, maxMinutes };
    }
  }

  if (
    Array.isArray(durationRange) &&
    durationRange.length >= 2 &&
    Number.isFinite(Number(durationRange[0])) &&
    Number.isFinite(Number(durationRange[1]))
  ) {
    return {
      minMinutes: Number(durationRange[0]),
      maxMinutes: Number(durationRange[1]),
    };
  }

  return null;
}

// POST /api/process/outline - Start an outline generation task
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

    const body = await request.json();
    const {
      videoId,
      topic,
      genre,
      researchToggle,
      durationRange,
      angle,
      mustInclude,
      mustAvoid,
      sourcePreferences,
      stockMediaLevel,
      pov,
      protagonistGender,
      openrouterModel,
      qualityReviewModel,
      contentNiche,
      toneStyle,
      targetAudience,
    } = body;

    const normalizedDurationRange = normalizeDurationRange(durationRange);

    if (!videoId || !genre || !normalizedDurationRange) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: videoId, genre, durationRange",
        },
        { status: 400 },
      );
    }

    if (!VALID_GENRES.includes(genre)) {
      return NextResponse.json(
        {
          error: `Invalid genre. Must be one of: ${VALID_GENRES.join(", ")}`,
        },
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
      .select("id, idea, project_id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
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

    const resolvedConfig = resolveWritingConfig({
      topic: topic || video.idea || "Untitled Video",
      genre,
      researchToggle: normalizeResearchDepth(researchToggle),
      angle,
      sourcePreferences,
      projectSettings: projectSettings as any,
      overrides: {
        toneStyle,
        targetAudience,
        pov,
        protagonistGender,
        openrouterModel,
        qualityReviewModel,
        contentNiche,
      },
    });

    const input = {
      topic: resolvedConfig.topic,
      genre: resolvedConfig.genre,
      researchToggle: resolvedConfig.researchToggle,
      durationRange: normalizedDurationRange,
      stockMediaLevel,
      angle: resolvedConfig.angle,
      mustInclude,
      mustAvoid,
      sourcePreferences: resolvedConfig.sourcePreferences,
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
        type: "outline",
        name: `Outline: ${resolvedConfig.topic.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: {
          videoId,
          ...input,
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create outline task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await outlineQueue.add(
      "outline",
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        input,
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
    console.error("Failed to start outline task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
