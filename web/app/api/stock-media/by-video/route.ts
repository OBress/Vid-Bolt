import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/stock-media/by-video?videoId=xxx
 * 
 * Fetches all stock media scraped for a specific video.
 * Used by Step 5 to populate the Elements Stock tab.
 * 
 * SECURITY: Requires authenticated user. Uses user-scoped Supabase client.
 */
export async function GET(request: NextRequest) {
  // Authenticate user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json(
      { error: "videoId is required" },
      { status: 400 }
    );
  }

  try {
    // Query stock media for this video (uses user-scoped client from auth above)
    const { data, error } = await supabase
      .from("stock_media")
      .select("id, source, r2_key, metadata")
      .eq("video_id", videoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[stock-media/by-video] Error fetching stock media:", error);
      return NextResponse.json(
        { error: "Failed to fetch stock media" },
        { status: 500 }
      );
    }

    // Transform to UI-friendly format
    const stockMedia = (data || []).map((item) => ({
      id: item.id,
      source: item.source,
      title: item.metadata?.title || item.metadata?.description || `${item.source} Image`,
      url: item.metadata?.url || null,
      thumbnailUrl: item.metadata?.thumbnailUrl || item.metadata?.url || null,
      r2Key: item.r2_key,
    }));

    console.log(`[stock-media/by-video] Found ${stockMedia.length} items for video ${videoId}`);

    return NextResponse.json({ stockMedia });
  } catch (err) {
    console.error("[stock-media/by-video] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
