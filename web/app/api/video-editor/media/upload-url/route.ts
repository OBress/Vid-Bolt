/**
 * Video Editor Media - Upload URL Route
 * 
 * Generates a presigned URL for direct upload to R2 storage.
 * The client uploads directly to R2, then calls /register to save metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePresignedPutUrl } from "@/lib/services/r2-storage";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const { filename, contentType, size, projectId } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename and contentType are required" },
        { status: 400 }
      );
    }

    // 3. Check file size (1GB limit)
    if (size && size > 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 1GB limit" },
        { status: 400 }
      );
    }

    // 4. Generate storage key for video editor media
    const uuid = crypto.randomUUID();
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = projectId
      ? `video-editor/${user.id}/projects/${projectId}/${uuid}-${safeName}`
      : `video-editor/${user.id}/media/${uuid}-${safeName}`;

    // 5. Generate presigned PUT URL (1 hour expiry)
    const { putUrl, publicUrl } = await generatePresignedPutUrl(
      key,
      contentType,
      3600
    );

    console.log(
      `[VideoEditorMedia] Generated upload URL for ${filename} (user: ${user.id})`
    );

    return NextResponse.json({
      success: true,
      uploadUrl: putUrl,
      key,
      publicUrl,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error generating upload URL:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
