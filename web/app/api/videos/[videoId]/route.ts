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

    // Fetch audio chunks from linked audio task if available
    let audioChunks: Array<{ chapterNumber: number; url: string; duration_seconds?: number }> = [];
    
    // Check metadata first (new source of truth)
    if (video.metadata && (video.metadata as any).audio_chunks) {
        console.log("[API DEBUG] Found chunks in metadata:", (video.metadata as any).audio_chunks.length);
        audioChunks = (video.metadata as any).audio_chunks;
    } else {
        console.log("[API DEBUG] No chunks in metadata. Metadata keys:", Object.keys(video.metadata || {}));
    }

    // Fallback to task output (legacy)
    if ((!audioChunks || audioChunks.length === 0) && video.audio_task_id) {
      console.log("[API DEBUG] Checking task output for task:", video.audio_task_id);
      const { data: task } = await supabase
        .from("tasks")
        .select("output_data")
        .eq("id", video.audio_task_id)
        .single();
      
      console.log("[API DEBUG] Task output_data keys:", Object.keys(task?.output_data || {}));
      
      if (task?.output_data) {
        const outputData = task.output_data as { tts_chunks?: Array<{ chapterNumber: number; url: string; duration_seconds?: number }> };
        if (outputData.tts_chunks && Array.isArray(outputData.tts_chunks)) {
          console.log("[API DEBUG] Found chunks in task output:", outputData.tts_chunks.length);
          audioChunks = outputData.tts_chunks;
        } else {
           console.log("[API DEBUG] No tts_chunks in task output");
        }
      }
    }

    // Normalize chunks (ensure chapterNumber is present)
    if (Array.isArray(audioChunks)) {
      audioChunks = audioChunks.map((c: any) => ({
        ...c,
        chapterNumber: c.chapterNumber ?? c.chunkIndex,
      }));
    }

    return NextResponse.json({ video, audioChunks });
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

    // If metadata is being updated, we need to merge it carefully
    // to avoid overwriting existing metadata fields (like audio_chunks wiping outlineOutput)
    let updateBody = { ...body };
    
    if (body.metadata) {
      // Fetch current metadata first
      const { data: currentVideo, error: fetchError } = await supabase
        .from("video_projects")
        .select("metadata")
        .eq("id", videoId)
        .eq("user_id", user.id)
        .single();
        
      if (!fetchError && currentVideo) {
        const currentMetadata = (currentVideo.metadata as any) || {};
        updateBody.metadata = {
          ...currentMetadata,
          ...body.metadata,
        };
        console.log("[API] Merging metadata for video", videoId);
        console.log("[API] Old keys:", Object.keys(currentMetadata));
        console.log("[API] New/Updated keys:", Object.keys(body.metadata || {}));
      }
    }

    // Update video (RLS will ensure user owns it)
    const { data: video, error } = await supabase
      .from("video_projects")
      .update({
        ...updateBody,
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

// DELETE /api/videos/[videoId] - Delete video with full cleanup (R2 + DB)
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

    const supabase = getServiceClient();

    // First, fetch the video to verify ownership and get linked task IDs
    const { data: video, error: fetchError } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
      if (fetchError?.code === "PGRST116") {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      console.error("Failed to fetch video for deletion:", fetchError);
      return NextResponse.json({ error: fetchError?.message || "Video not found" }, { status: 500 });
    }

    // Clean up R2 storage files
    let r2CleanupResult = { deleted: 0, errors: [] as string[] };
    try {
      const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
      
      if (isR2Configured()) {
        // Delete ALL files for this video: users/{userId}/videos/{videoId}/
        const prefix = `${STORAGE_PATHS.USERS}/${user.id}/${STORAGE_PATHS.VIDEOS}/${videoId}/`;
        r2CleanupResult = await deleteFilesWithPrefix(prefix);
        
        if (r2CleanupResult.errors.length > 0) {
          console.warn("Some R2 files failed to delete:", r2CleanupResult.errors);
        }
        console.log(`Deleted ${r2CleanupResult.deleted} R2 files for video ${videoId}`);
      }
    } catch (r2Error) {
      // Log but don't fail the deletion if R2 cleanup fails
      console.error("R2 cleanup error (continuing with DB deletion):", r2Error);
    }

    // Delete linked tasks (if any)
    const taskIds = [
      video.script_task_id,
      video.audio_task_id,
      video.video_task_id,
      video.export_task_id,
    ].filter(Boolean);

    if (taskIds.length > 0) {
      const { error: tasksError } = await supabase
        .from("tasks")
        .delete()
        .in("id", taskIds);

      if (tasksError) {
        console.warn("Failed to delete linked tasks:", tasksError);
        // Continue with video deletion even if task deletion fails
      }
    }

    // Delete the video record
    const { error: deleteError } = await supabase
      .from("video_projects")
      .delete()
      .eq("id", videoId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Failed to delete video:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      id: videoId,
      r2FilesDeleted: r2CleanupResult.deleted,
    });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

