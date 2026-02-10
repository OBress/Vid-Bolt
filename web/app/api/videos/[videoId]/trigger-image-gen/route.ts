import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gpuImageCreateQueue } from "@/lib/queues";

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = video.metadata as any || {};
    const shotList = metadata.shot_list || [];
    
    // Filter shots for images
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shotsToGenerate = shotList.filter((s: any) => s.visual_prompt && s.media_type === "image");

    console.log(`[API] Triggering image gen for video ${videoId}. Found ${shotsToGenerate.length} images to generate out of ${shotList.length} shots.`);

    // Queue image generation jobs for each shot
    const jobs: any[] = [];
    for (const shot of shotsToGenerate) {
      const job = await gpuImageCreateQueue.add('shot-image', {
        taskId: shot.shot_id || crypto.randomUUID(),
        userId: video.user_id,
        prompt: shot.visual_prompt,
        aspectRatio: '16:9',
      });
      jobs.push((job as any).id);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Triggered image generation workflow",
      videoId,
      totalShots: shotList.length,
      imageShots: shotsToGenerate.length,
      jobIds: jobs,
    });

  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
