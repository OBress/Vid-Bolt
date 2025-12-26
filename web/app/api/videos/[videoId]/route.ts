import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { UpdateVideoInput } from "@/types/video";

// Helper to get authenticated user
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

// GET /api/videos/[videoId] - Get single video
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Fetch video with RLS check (user must own the video)
    const { data: video, error } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      console.error("Failed to fetch video:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ video });
  } catch (error) {
    console.error("Failed to get video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH /api/videos/[videoId] - Update video
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body: UpdateVideoInput = await request.json();

    const supabase = getServiceClient();

    // Update video (RLS will ensure user owns it)
    const { data: video, error } = await supabase
      .from("video_projects")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      console.error("Failed to update video:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, video });
  } catch (error) {
    console.error("Failed to update video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE /api/videos/[videoId] - Delete video (soft delete by setting status to cancelled)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const hard = searchParams.get("hard") === "true";

    const supabase = getServiceClient();

    if (hard) {
      // Hard delete - permanently remove the record
      const { error } = await supabase
        .from("video_projects")
        .delete()
        .eq("id", videoId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete video:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Soft delete - set status to cancelled
      const { error } = await supabase
        .from("video_projects")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to cancel video:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id: videoId });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
