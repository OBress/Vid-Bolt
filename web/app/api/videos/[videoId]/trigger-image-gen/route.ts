import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId param" }, { status: 400 });
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch video to get metadata
    const { data: video, error } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .single();

    if (error || !video) {
        return NextResponse.json({ error: "Video not found", details: error }, { status: 404 });
    }

    const metadata = video.metadata as any || {};
    const shotList = metadata.shot_list || [];
    
    // Filter shots manually to see count
    const shotsToGenerate = shotList.filter((s: any) => s.visual_prompt && s.media_type === "image");

    console.log(`[API] Triggering image gen for video ${videoId}. Found ${shotsToGenerate.length} images to generate out of ${shotList.length} shots.`);

    // Manually trigger the event
    await inngest.send({
      name: "av-script/generate.finished",
      data: {
        videoId: video.id,
        userId: video.user_id,
        shots: shotList, // Pass all shots, let workflow filter
      },
    });

    return NextResponse.json({ 
        success: true, 
        message: "Manually triggered image generation workflow",
        videoId,
        totalShots: shotList.length,
        imageShots: shotsToGenerate.length
    });

  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
