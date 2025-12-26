import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { inngest } from "@/lib/inngest/client";
import type { VideoProject } from "@/types/video";
import { canResumeVideo, getNextStage } from "@/types/video";

// Helper to get authenticated user
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  
  if (authError || !user) {
    return { user: null, error: "Unauthorized" };
  }

  return { user, error: null };
}

// Helper to get service role Supabase client
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Determine what action to take based on current stage
function determineResumeAction(video: VideoProject): {
  action: string;
  eventName: string;
  eventData: any;
} {
  const { current_stage, idea, script_content, audio_url } = video;

  switch (current_stage) {
    case "idea":
    case "script":
      // Need to generate or regenerate script
      return {
        action: "Generate script",
        eventName: "writing/workflow.start",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          scriptType: "long_form", // Default, could be from metadata
          idea: idea || "",
          researchEnabled: false,
          numberOfChapters: 1,
        },
      };

    case "audio":
      // Need to generate audio
      if (!script_content) {
        throw new Error("Cannot generate audio without script");
      }
      return {
        action: "Generate audio",
        eventName: "audio/generate.start",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          script: script_content,
          voiceProvider: "inworld", // Using Inworld TTS
          voiceModel: "Hades",
        },
      };

    case "video":
      // Need to generate video
      if (!audio_url) {
        throw new Error("Cannot generate video without audio");
      }
      return {
        action: "Generate video",
        eventName: "video/workflow.start",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          script: script_content || "",
          audioUrl: audio_url,
          imageModel: "default", // Should come from project settings
          videoModel: "default",
        },
      };

    case "export":
      // Need to export video
      return {
        action: "Export video",
        eventName: "export/workflow.start",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          videoUrl: video.video_url || "",
          targets: ["youtube"], // Should come from project settings
        },
      };

    default:
      throw new Error(`Cannot resume from stage: ${current_stage}`);
  }
}

// POST /api/videos/[videoId]/resume - Resume incomplete video
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Fetch video
    const { data: video, error: fetchError } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Check if video can be resumed
    if (!canResumeVideo(video)) {
      return NextResponse.json(
        { error: "Video cannot be resumed (already completed or cancelled)" },
        { status: 400 }
      );
    }

    // Determine what action to take
    const { action, eventName, eventData } = determineResumeAction(video);

    // Update video status to processing
    const { data: updatedVideo, error: updateError } = await supabase
      .from("video_projects")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update video status:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create a task for this workflow
    const taskType = video.current_stage === "audio" ? "audio" 
                   : video.current_stage === "video" ? "video" 
                   : video.current_stage === "export" ? "export" 
                   : "writing";
    
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        project_id: video.project_id || null,
        type: taskType,
        name: `${action}: ${video.name}`.substring(0, 100),
        status: "pending",
        steps: [],
        input_data: eventData,
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Trigger Inngest workflow with taskId
    const event = await inngest.send({
      name: eventName,
      data: {
        ...eventData,
        taskId: task.id,
      },
    });

    return NextResponse.json({
      success: true,
      video: updatedVideo,
      nextAction: action,
      taskId: task.id,
    });
  } catch (error) {
    console.error("Failed to resume video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
