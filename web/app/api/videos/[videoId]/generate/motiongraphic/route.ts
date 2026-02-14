/**
 * Generate Motion Graphic API Route
 * ============================================================================
 * POST /api/videos/[videoId]/generate/motiongraphic
 *
 * Real motion graphic generation endpoint for the pipeline.
 * Calls MotionGraphicsService via the pipeline orchestrator and returns
 * the generated Remotion code.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  generateMotionGraphic,
  type ImageAsset,
  type PipelineGenerationRequest,
} from "@/lib/services/motion-graphics/pipeline-motion-graphics";
import type { RoutingTag } from "@/types/video";

// Allow up to 5 minutes for complex motion graphics
export const maxDuration = 300;

interface GenerateMotionGraphicBody {
  shotIndex: number;
  prompt: string;
  duration?: number;
  contextHint?: string;
  routingTags?: RoutingTag[];
  imageAssets?: ImageAsset[];
  previousQCFeedback?: string;
  simplifiedRetry?: boolean;
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

    // 1. Authenticate via Supabase session
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

    // 2. Parse request body
    const body: GenerateMotionGraphicBody = await request.json();
    const {
      shotIndex,
      prompt,
      duration = 5,
      contextHint,
      routingTags = [],
      imageAssets = [],
      previousQCFeedback,
      simplifiedRetry = false,
    } = body;

    if (shotIndex === undefined || !prompt) {
      return NextResponse.json(
        { error: "shotIndex and prompt are required" },
        { status: 400 }
      );
    }

    // 3. Get OpenRouter API key
    let apiKey = request.headers.get('x-openrouter-key');

    if (!apiKey) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: apiKeyData } = await supabase
        .from("user_api_keys")
        .select("openrouter_key")
        .eq("user_id", user.id)
        .single();

      apiKey = apiKeyData?.openrouter_key;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key not configured" },
        { status: 400 }
      );
    }

    // 4. Verify video ownership
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, user_id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Get preferred model from user settings or use default
    const { data: settingsData } = await supabase
      .from("user_api_keys")
      .select("openrouter_model")
      .eq("user_id", user.id)
      .single();

    const model = settingsData?.openrouter_model || "google/gemini-2.5-flash-preview";

    console.log(`[GenerateMotionGraphic] Generating for video ${videoId}, shot ${shotIndex}, model: ${model}`);

    // 6. Call pipeline generator
    const pipelineRequest: PipelineGenerationRequest = {
      prompt,
      duration,
      shotIndex,
      videoId,
      apiKey,
      model,
      routingTags,
      imageAssets,
      contextHint,
      previousQCFeedback,
      simplifiedRetry,
    };

    const result = await generateMotionGraphic(pipelineRequest);

    if (!result.success) {
      console.error(`[GenerateMotionGraphic] Failed for shot ${shotIndex}:`, result.error);
      return NextResponse.json(
        {
          success: false,
          shotIndex,
          error: result.error,
          status: "failed",
          remotion_code: result.remotionCode, // Include partial code for debugging
        },
        { status: 422 }
      );
    }

    // 7. Return generated code
    return NextResponse.json({
      success: true,
      shotIndex,
      status: "completed",
      remotion_code: result.remotionCode,
      skills: result.skills,
      durationFrames: result.durationFrames,
      usedIcons: result.usedIcons,
    });
  } catch (error) {
    console.error("[GenerateMotionGraphic] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
