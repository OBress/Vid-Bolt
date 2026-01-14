import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { writingQueue, audioQueue, visualDirectorQueue } from "@/lib/queues";
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

// Resume action configuration
interface ResumeAction {
  action: string;
  taskType: 'writing' | 'audio' | 'video' | 'export';
  queueName: 'writing' | 'audio' | 'visual-director';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: any;
}

// Determine what action to take based on current stage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function determineResumeAction(video: VideoProject, voiceSettings?: any): ResumeAction {
  const { current_stage, idea, script_content, audio_url } = video;

  switch (current_stage) {
    case "idea":
    case "script":
      return {
        action: "Generate script",
        taskType: "writing",
        queueName: "writing",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          scriptType: "long_form",
          idea: idea || "",
          researchEnabled: false,
          numberOfChapters: 1,
        },
      };

    case "audio":
      if (!script_content) {
        throw new Error("Cannot generate audio without script");
      }
      
      return {
        action: "Generate audio",
        taskType: "audio",
        queueName: "audio",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          script: script_content,
          voiceProvider: voiceSettings?.provider || "inworld",
          voiceModel: voiceSettings?.model || "inworld-tts-1-max",
          voiceName: voiceSettings?.voiceName || "Hades",
          voiceSettings: {
            speakingRate: voiceSettings?.speakingSpeed ? voiceSettings.speakingSpeed / 100 : 1.0,
            temperature: voiceSettings?.provider === 'inworld' ? voiceSettings?.stability : undefined,
            stability: voiceSettings?.provider !== 'inworld' ? voiceSettings?.stability : undefined,
            similarityBoost: voiceSettings?.similarityBoost,
          },
        },
      };

    case "video":
      if (!audio_url) {
        throw new Error("Cannot generate video without audio");
      }
      return {
        action: "Generate video",
        taskType: "video",
        queueName: "visual-director",
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          script: script_content || "",
          audioUrl: audio_url,
        },
      };

    case "export":
      return {
        action: "Export video",
        taskType: "export",
        queueName: "visual-director", // Placeholder - export not fully implemented
        eventData: {
          videoId: video.id,
          userId: video.user_id,
          projectId: video.project_id,
          videoUrl: video.video_url || "",
          targets: ["youtube"],
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

    const typedVideo = video as VideoProject;

    // Check if video can be resumed
    if (!canResumeVideo(typedVideo)) {
      return NextResponse.json(
        { error: "Video cannot be resumed. It must be in 'pending', 'draft', or 'error' status." },
        { status: 400 }
      );
    }

    // Get voice settings from request body (optional)
    let voiceSettings = null;
    try {
      const body = await request.json();
      voiceSettings = body.voiceSettings || null;
    } catch {
      // No body, that's fine
    }

    // Determine what to do
    const resumeAction = determineResumeAction(typedVideo, voiceSettings);

    // Update video status to processing
    const nextStage = getNextStage(typedVideo);
    const { data: updatedVideo, error: updateError } = await supabase
      .from("video_projects")
      .update({
        status: "processing",
        current_stage: nextStage || typedVideo.current_stage,
        current_step: resumeAction.action,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update video:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create task record
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        project_id: typedVideo.project_id || null,
        type: resumeAction.taskType,
        name: `${resumeAction.action}: Video ${videoId.slice(0, 8)}`,
        status: "pending",
        steps: [],
        input_data: resumeAction.eventData,
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Dispatch to appropriate BullMQ queue
    const jobData = {
      ...resumeAction.eventData,
      taskId: task.id,
    };

    let jobId: string | undefined;

    if (resumeAction.queueName === "writing") {
      const job = await writingQueue.add('write-script', jobData, { jobId: task.id });
      jobId = job.id;
    } else if (resumeAction.queueName === "audio") {
      const job = await audioQueue.add('generate-audio', jobData, { jobId: task.id });
      jobId = job.id;
    } else if (resumeAction.queueName === "visual-director") {
      const job = await visualDirectorQueue.add('generate-video', jobData, { jobId: task.id });
      jobId = job.id;
    }

    return NextResponse.json({
      success: true,
      video: updatedVideo,
      nextAction: resumeAction.action,
      taskId: task.id,
      jobId,
    });
  } catch (error) {
    console.error("Failed to resume video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
