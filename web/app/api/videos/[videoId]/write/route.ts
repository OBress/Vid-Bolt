import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { writingQueue } from "@/lib/queues";
import type { VideoProject } from "@/types/video";

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

interface WriteRequestBody {
  expandedIdea?: string;
  scriptType?: "top_10" | "long_form" | "kitcon";
  researchEnabled?: boolean;
  numberOfChapters?: number;
}

// POST /api/videos/[videoId]/write - Trigger script writing workflow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const body: WriteRequestBody = await request.json();
    
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

    // Determine the idea to use (expanded idea from body, or from video metadata, or original)
    const idea = body.expandedIdea 
      || (typedVideo.metadata as Record<string, unknown>)?.expanded_idea as string | undefined
      || typedVideo.idea;

    if (!idea) {
      return NextResponse.json(
        { error: "No idea available for script generation." },
        { status: 400 }
      );
    }

    // Create task for script writing
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        project_id: typedVideo.project_id || null,
        type: "writing",
        name: `Write Script: ${idea.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: {
          scriptType: body.scriptType || "long_form",
          idea,
          researchEnabled: body.researchEnabled ?? false,
          numberOfChapters: body.numberOfChapters ?? 1, // Default to 1 chapter for video scripts
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Update video status to processing
    await supabase
      .from("video_projects")
      .update({
        status: "processing",
        current_stage: "script",
        current_step: "Writing script...",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Add job to BullMQ queue
    const job = await writingQueue.add(
      'write-script', // Job name
      {
        taskId: task.id,
        userId: user.id,
        projectId: typedVideo.project_id,
        videoId,
        scriptType: body.scriptType || "long_form",
        idea,
        researchEnabled: body.researchEnabled ?? false,
        numberOfChapters: body.numberOfChapters ?? 1,
      },
      {
        jobId: task.id, // Use taskId as jobId for easy correlation
      }
    );

    return NextResponse.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
    });
  } catch (error) {
    console.error("Failed to start script writing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
