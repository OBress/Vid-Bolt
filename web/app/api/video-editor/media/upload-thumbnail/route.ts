/**
 * Video Editor Media - Upload Thumbnail Route
 * 
 * POST: Upload a base64 encoded thumbnail directly to R2.
 * Used for generated thumbnails (video frames, image previews).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadAudioBuffer } from "@/lib/services/r2-storage";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const { base64, projectId, _filename } = await request.json();

    if (!base64) {
      return NextResponse.json(
        { error: "base64 data is required" },
        { status: 400 }
      );
    }

    // 3. Parse base64 data URL
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return NextResponse.json(
        { error: "Invalid base64 format. Expected: data:mime/type;base64,..." },
        { status: 400 }
      );
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");

    // 4. Generate storage key
    const uuid = crypto.randomUUID();
    const ext = contentType.split("/")[1] || "jpg";
    const key = projectId
      ? `video-editor/${user.id}/projects/${projectId}/thumbnails/${uuid}.${ext}`
      : `video-editor/${user.id}/thumbnails/${uuid}.${ext}`;

    // 5. Upload to R2 (using existing uploadAudioBuffer which handles any buffer)
    const result = await uploadAudioBuffer(buffer, key, contentType);

    console.log(
      `[VideoEditorMedia] Uploaded thumbnail: ${key} (user: ${user.id})`
    );

    return NextResponse.json({
      success: true,
      url: result.url,
      key,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error uploading thumbnail:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
