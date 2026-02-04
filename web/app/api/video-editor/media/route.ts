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

    // 3. Query media using service role
    const serviceClient = getServiceClient();
    
    let query = serviceClient
      .from("video_editor_media")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Filter by project if specified
    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: mediaList, error: queryError } = await query;

    if (queryError) {
      console.error("[VideoEditorMedia] Query error:", queryError);
      return NextResponse.json(
        { error: queryError.message },
        { status: 500 }
      );
    }

    // 4. Transform to camelCase for frontend
    const media = (mediaList || []).map((item) => ({
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
    }));

    return NextResponse.json({
      success: true,
      media,
    });
  } catch (error) {
    console.error("[VideoEditorMedia] Error listing media:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
