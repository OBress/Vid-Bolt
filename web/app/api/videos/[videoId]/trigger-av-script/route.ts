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
    const wordTimestamps = metadata.word_timestamps || [];
    const totalDuration = metadata.total_duration_seconds || 0;
    // We might need script content too
    const script = video.script_content || "";

    if (!wordTimestamps || wordTimestamps.length === 0) {
        return NextResponse.json({ error: "Word timestamps missing. Audio generation incomplete?" }, { status: 400 });
    }

    console.log(`[API] Triggering AV script gen for video ${videoId}.`);

    const avScriptTaskId = crypto.randomUUID();

    // Reset AV script completion flag
    await supabase.from("video_projects").update({
             metadata: {
                 ...metadata,
                 av_script_completed: false,
                 shot_list: [] 
             }
         }).eq("id", videoId);

    // Manually trigger the event
    await inngest.send({
        name: "av-script/generate.start",
        data: {
          taskId: avScriptTaskId,
          userId: video.user_id,
          videoId,
          script,
          wordTimestamps: wordTimestamps,
          totalDurationSeconds: totalDuration,
        },
      });

    return NextResponse.json({ 
        success: true, 
        message: "Manually triggered AV script generation workflow",
        videoId,
        wordCount: wordTimestamps.length
    });

  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
