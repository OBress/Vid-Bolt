import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get("videoId");

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

    console.log(`[DEBUG API] Triggering image gen for video ${videoId}. Found ${shotsToGenerate.length} images to generate out of ${shotList.length} shots.`);

    // Manually trigger the event
    await inngest.send({
      name: "av-script/generate.finished",
      data: {
        videoId: video.id,
        userId: video.user_id,
        shots: shotList, // This tool call is a placeholder, I will use write_to_file next.er
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
    console.error("[DEBUG API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
