import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/stock-media/by-video?videoId=xxx
 * 
 * Fetches all stock media scraped for a specific video.
 * Used by Step 5 to populate the Elements Stock tab.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json(
      { error: "videoId is required" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Query stock media for this video
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
