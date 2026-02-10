
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch Video
  const { data: video, error: videoError } = await supabase
    .from("video_projects")
    .select("*")
    .eq("id", videoId)
    .single();

  if (videoError) {
    return NextResponse.json({ error: "Video Error", details: videoError });
  }

  // 2. Fetch Audio Task if linked
  let task = null;
  if (video.audio_task_id) {
    const { data: taskData } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", video.audio_task_id)
      .single();
    task = taskData;
  }

  // 3. Dump everything
  return NextResponse.json({
    video_id: video.id,
    metadata_keys: Object.keys(video.metadata || {}),
    metadata_audio_chunks: (video.metadata as any)?.audio_chunks,
    audio_task_id: video.audio_task_id,
    task_status: (task as any)?.status,
    task_output_keys: Object.keys((task as any)?.output_data || {}),
    task_output_tts_chunks: ((task as any)?.output_data as any)?.tts_chunks,
    full_video: video,
    full_task: task
  });
}
