/**
 * Video Editor Media - Bulk Delete Route
 * 
 * DELETE: Bulk delete media files by project or specific IDs.
 * Efficiently deletes from both R2 storage and Supabase in one call.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { deleteFiles } from "@/lib/services/r2-storage";
import { getVideoEditorMediaDeletionKeys } from "@/lib/services/video-editor-media";

// Service role client for database operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createServiceClient(supabaseUrl, supabaseKey);
}

interface BulkDeleteRequest {
  projectId?: string;
  mediaIds?: string[];
}

export async function DELETE(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const body: BulkDeleteRequest = await request.json();
    const { projectId, mediaIds } = body;

    if (!projectId && (!mediaIds || mediaIds.length === 0)) {
      return NextResponse.json(
        { error: "Must provide either projectId or mediaIds" },
        { status: 400 }
      );
    }

    const serviceClient = getServiceClient();

    // 3. Query media to delete (to get S3 keys)
    let query = serviceClient
      .from("video_editor_media")
      .select("id, s3_key, s3_url, normalized_audio_url")
      .eq("user_id", user.id);

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else if (mediaIds && mediaIds.length > 0) {
      query = query.in("id", mediaIds);
    }

    const { data: mediaToDelete, error: queryError } = await query;

    if (queryError) {
      console.error("[VideoEditorMedia] Bulk query error:", queryError);
      return NextResponse.json(
        { error: queryError.message },
        { status: 500 }
      );
    }

    if (!mediaToDelete || mediaToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: "No media found to delete",
      });
    }

    // 4. Extract S3 keys and delete from R2 in batch
    const s3Keys = mediaToDelete.flatMap(getVideoEditorMediaDeletionKeys);
    const mediaIdsToDelete = mediaToDelete.map(m => m.id);

    console.log(`[VideoEditorMedia] Bulk deleting ${s3Keys.length} files from R2`);
    const r2Result = await deleteFiles(s3Keys);

    if (r2Result.errors.length > 0) {
      console.warn("[VideoEditorMedia] Some R2 deletes failed:", r2Result.errors);
    }

    // 5. Delete from Supabase
    const { error: deleteError } = await serviceClient
      .from("video_editor_media")
      .delete()
      .in("id", mediaIdsToDelete);

    if (deleteError) {
      console.error("[VideoEditorMedia] Supabase delete error:", deleteError);
      return NextResponse.json(
        { 
          error: deleteError.message,
          partialSuccess: true,
          r2Deleted: r2Result.deleted,
        },
        { status: 500 }
      );
    }

    console.log(`[VideoEditorMedia] Bulk deleted ${mediaIdsToDelete.length} records`);

    return NextResponse.json({
      success: true,
      deletedCount: mediaIdsToDelete.length,
      r2Deleted: r2Result.deleted,
      r2Errors: r2Result.errors.length > 0 ? r2Result.errors : undefined,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Bulk delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
