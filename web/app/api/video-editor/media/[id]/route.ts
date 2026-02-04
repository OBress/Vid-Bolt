/**
 * Video Editor Media - Delete Route
 * 
 * DELETE: Delete a specific media file by ID.
 * Removes from both R2 storage and Supabase database.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { deleteFile } from "@/lib/services/r2-storage";

// Service role client for database operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createServiceClient(supabaseUrl, supabaseKey);
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get media ID from params
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Media ID is required" },
        { status: 400 }
      );
    }

    // 3. Get the media record first (to get s3_key and verify ownership)
    const serviceClient = getServiceClient();
    
    const { data: media, error: fetchError } = await serviceClient
      .from("video_editor_media")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)  // Ensure user owns this media
      .single();

    if (fetchError || !media) {
      return NextResponse.json(
        { error: "Media not found or access denied" },
        { status: 404 }
      );
    }

    // 4. Delete from R2 storage
    try {
      await deleteFile(media.s3_key);
    } catch (r2Error) {
      console.warn(
        `[VideoEditorMedia] Failed to delete from R2: ${media.s3_key}`,
        r2Error
      );
      // Continue with database deletion even if R2 fails
    }

    // 5. Delete from database
    const { error: deleteError } = await serviceClient
      .from("video_editor_media")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[VideoEditorMedia] Delete error:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    console.log(
      `[VideoEditorMedia] Deleted media: ${id} (user: ${user.id})`
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error deleting media:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
