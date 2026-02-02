/**
 * Generate Motion Graphic API Route
 * ============================================================================
 * POST /api/videos/[videoId]/generate/motiongraphic
 * 
 * Mock endpoint for motion graphics. Remotion renders client-side,
 * so this returns immediate "completion" with placeholder data.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface GenerateMotionGraphicRequest {
  shotIndex: number;
  prompt: string;
  elements?: Array<{ type: string; content: string }>;
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

    const body: GenerateMotionGraphicRequest = await request.json();
    const { shotIndex, prompt, elements } = body;

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

    console.log(`[GenerateMotionGraphic] Mock generation for video ${videoId}, shot ${shotIndex}`);

    // Motion graphics are rendered client-side via Remotion.
    // This endpoint returns a mock "completed" status immediately.
    // The actual rendering happens in the Remotion player/export pipeline.

    return NextResponse.json({
      success: true,
      shotIndex,
      status: "completed",
      message: "Motion graphics render client-side via Remotion",
      mockData: {
        prompt,
        elements: elements || [],
        renderType: "remotion",
      },
    });
  } catch (error) {
    console.error("[GenerateMotionGraphic] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
