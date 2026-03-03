import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CreateVideoInput } from "@/types/video";

// Helper to get authenticated Supabase client
async function getAuthenticatedUser() {
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
    return { user: null, error: "Unauthorized" };
  }

  return { user, error: null };
}

// Helper to get service role Supabase client
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/videos - Create new video project
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body: CreateVideoInput = await request.json();
    const { name, idea, project_id, description, metadata } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: "Missing required fields: name" },
        { status: 400 }
      );
    }

    // Create video project using service role
    const supabase = getServiceClient();

    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .insert({
        user_id: user.id,
        project_id: project_id || null,
        name,
        idea: idea || "",
        description: description || null,
        metadata: metadata || {},
        status: "draft",
        current_stage: "outline",
        progress_percent: 0,
      })
      .select()
      .single();

    if (videoError) {
      console.error("Failed to create video project:", videoError);
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // Fire-and-forget: generate SVG thumbnail in the background
    // This never blocks the response — failures are silently logged
    (async () => {
      try {
        const { generateThumbnailSvg } = await import("@/lib/ai/svg-thumbnail");
        const svg = await generateThumbnailSvg(user.id, name);
        if (svg) {
          await supabase.rpc("merge_video_metadata", {
            p_video_id: video.id,
            p_updates: { thumbnail_svg: svg },
          });
        }
      } catch (err) {
        console.error("[SVG Thumbnail] Background generation failed:", err);
      }
    })();

    return NextResponse.json({ success: true, video }, { status: 201 });
  } catch (error) {
    console.error("Failed to create video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/videos - List user's videos with filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const userId = searchParams.get("userId");
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const stage = searchParams.get("stage");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Build query with filters
    let query = supabase
      .from("video_projects")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply optional filters
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (stage) {
      query = query.eq("current_stage", stage);
    }

    const { data: videos, error, count } = await query;

    if (error) {
      console.error("Failed to fetch videos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      videos: videos || [],
      total: count || 0,
      hasMore: count ? offset + limit < count : false,
    });
  } catch (error) {
    console.error("Failed to list videos:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
