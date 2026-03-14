/**
 * Video Editor Media - List Route
 * 
 * GET: List all media files for the authenticated user.
 * Optionally filter by project ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Service role client for database operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createServiceClient(supabaseUrl, supabaseKey);
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase SSR
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const includeGenerated = searchParams.get("includeGenerated") === "true";
    
    // Pagination params (default: 50 items, max: 100)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 3. Query media using service role with pagination
    const serviceClient = getServiceClient();
    
    let query = serviceClient
      .from("video_editor_media")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by project if specified
    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: mediaList, error: queryError, count } = await query;

    if (queryError) {
      console.error("[VideoEditorMedia] Query error:", queryError);
      return NextResponse.json(
        { error: queryError.message },
        { status: 500 }
      );
    }

    // 4. Transform to camelCase for frontend
    const media = (mediaList || []).map((item: any) => ({
      id: item.id,
      userId: item.user_id,
      projectId: item.project_id,
      s3Key: item.s3_key,
      s3Url: item.s3_url,
      name: item.name,
      type: item.type,
      size: item.size,
      duration: item.duration,
      thumbnail: item.thumbnail,
      width: item.width,
      height: item.height,
      createdAt: item.created_at,
      source: 'upload' as const,
    }));

    // 5. Optionally include generated project media from video_projects.metadata
    const generatedMedia: any[] = [];
    if (includeGenerated && projectId) {
      const { data: project } = await serviceClient
        .from('video_projects')
        .select('metadata')
        .eq('id', projectId)
        .single();

      if (project?.metadata) {
        const meta = project.metadata as Record<string, any>;
        const genImages = (meta.generated_images || {}) as Record<string, string>;
        const genVideos = (meta.generated_videos || {}) as Record<string, string>;

        // Convert generated videos to media items
        for (const [key, url] of Object.entries(genVideos)) {
          if (!url) continue;
          const shotMatch = key.match(/shot-(\d+)/);
          const shotNum = shotMatch ? parseInt(shotMatch[1]) : 0;
          generatedMedia.push({
            id: `gen-video-${key}`,
            userId: user.id,
            projectId,
            s3Key: '',
            s3Url: url,
            name: `Shot ${shotNum} (AI Video)`,
            type: 'video',
            size: 0,
            duration: null,
            thumbnail: null,
            width: null,
            height: null,
            createdAt: meta.edl_generated_at || new Date().toISOString(),
            source: 'generated',
          });
        }

        // Convert generated images to media items
        for (const [key, url] of Object.entries(genImages)) {
          if (!url) continue;
          const shotMatch = key.match(/shot-(\d+)/);
          const shotNum = shotMatch ? parseInt(shotMatch[1]) : 0;
          generatedMedia.push({
            id: `gen-image-${key}`,
            userId: user.id,
            projectId,
            s3Key: '',
            s3Url: url,
            name: `Shot ${shotNum} (AI Image)`,
            type: 'image',
            size: 0,
            duration: null,
            thumbnail: url,
            width: null,
            height: null,
            createdAt: meta.edl_generated_at || new Date().toISOString(),
            source: 'generated',
          });
        }
      }
    }

    // Generated media comes first, then user uploads
    const allMedia = [...generatedMedia, ...media];

    return NextResponse.json({
      success: true,
      media: allMedia,
      total: (count ?? media.length) + generatedMedia.length,
      limit,
      offset,
      generatedCount: generatedMedia.length,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error listing media:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
