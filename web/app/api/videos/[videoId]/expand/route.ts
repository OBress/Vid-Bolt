import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { inngest } from "@/lib/inngest/client";
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

// POST /api/videos/[videoId]/expand - Trigger idea expansion
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

    // Check if video has an idea
    if (!typedVideo.idea) {
      return NextResponse.json(
        { error: "No idea to expand. Please provide an idea first." },
        { status: 400 }
      );
    }

    // Create task for idea expansion
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        project_id: typedVideo.project_id || null,
        type: "writing",
        name: `Expand Idea: ${typedVideo.idea.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: { idea: typedVideo.idea },
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
        current_stage: "idea",
        current_step: "Expanding idea...",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Trigger Inngest workflow
    const event = await inngest.send({
      name: "idea/expand.start",
      data: {
        taskId: task.id,
        userId: user.id,
        videoId,
        idea: typedVideo.idea,
      },
    });

    return NextResponse.json({
      success: true,
      taskId: task.id,
      eventId: event.ids[0],
    });
  } catch (error) {
    console.error("Failed to start idea expansion:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
