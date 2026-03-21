/**
 * Video Editor Media - Register Route
 * 
 * Registers an uploaded file in Supabase after successful R2 upload.
 * Called by the client after completing the direct upload via presigned URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { mediaNormalizationQueue } from "@/lib/queues/queues";
import { getInitialAudioNormalizationStatus } from "@/lib/services/audio-normalization-metadata";
import { mapVideoEditorMediaRow } from "@/lib/services/video-editor-media";

// Service role client for database operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createServiceClient(supabaseUrl, supabaseKey);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const {
      id,
      projectId,
      s3Key,
      s3Url,
      name,
      type,
      size,
      duration,
      thumbnail,
      width,
      height,
    } = await request.json();

    // 3. Validate required fields
    if (!s3Key || !s3Url || !name || !type || !size) {
      return NextResponse.json(
        { error: "s3Key, s3Url, name, type, and size are required" },
        { status: 400 }
      );
    }

    // 4. Validate type
    const validTypes = ["video", "image", "audio"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // 5. Insert media record using service role
    const serviceClient = getServiceClient();
    
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      project_id: projectId || null,
      s3_key: s3Key,
      s3_url: s3Url,
      name,
      type,
      size,
      audio_normalization_status: getInitialAudioNormalizationStatus(type),
    };

    // Add optional fields only if provided
    if (id) insertData.id = id;
    if (duration !== undefined) insertData.duration = duration;
    if (thumbnail) insertData.thumbnail = thumbnail;
    if (width !== undefined) insertData.width = width;
    if (height !== undefined) insertData.height = height;

    const { data: media, error: insertError } = await serviceClient
      .from("video_editor_media")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error("[VideoEditorMedia] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    console.log(
      `[VideoEditorMedia] Registered media: ${media.id} (user: ${user.id})`
    );

    if (type === "audio" || type === "video") {
      try {
        await mediaNormalizationQueue.add(
          "normalize-media",
          {
            mediaId: media.id,
            userId: user.id,
            projectId: media.project_id,
            s3Key: media.s3_key,
            s3Url: media.s3_url,
            type: media.type,
            name: media.name,
          },
          {
            jobId: `media-normalization-${media.id}`,
          }
        );
      } catch (queueError) {
        const message =
          queueError instanceof Error ? queueError.message : "Queue enqueue failed";
        console.error("[VideoEditorMedia] Failed to enqueue normalization:", queueError);

        await serviceClient
          .from("video_editor_media")
          .update({
            audio_normalization_status: "failed",
            audio_normalization_error: message,
          })
          .eq("id", media.id);

        media.audio_normalization_status = "failed";
        media.audio_normalization_error = message;
      }
    }

    return NextResponse.json({
      success: true,
      media: mapVideoEditorMediaRow(media),
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error registering media:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
