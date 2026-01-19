import { NextRequest, NextResponse } from "next/server";
import { scriptWritingQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// POST /api/process/script-writing - Start a script writing task
export async function POST(request: NextRequest) {
  try {
    // Get user from session
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    // Get video data including outline output from metadata
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch video with outline data
    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("id, idea, metadata")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // Extract outline data from metadata
    const metadata = video.metadata as Record<string, any>;
    const outlineOutput = metadata?.outlineOutput;
    const outlineConfig = metadata?.outlineConfig;

    if (!outlineOutput || !outlineOutput.spine) {
      return NextResponse.json(
        { error: "Outline not found. Please complete Step 1 first." },
        { status: 400 }
      );
    }

    // Create task in database
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "script-writing",
        name: `Script: ${outlineConfig?.topic?.substring(0, 50) || video.idea?.substring(0, 50) || 'Untitled'}...`,
        status: "pending",
        steps: [],
        input_data: { 
          videoId,
          outlineData: outlineOutput,
          config: {
            topic: outlineConfig?.topic || video.idea,
            genre: outlineConfig?.genre || 'documentary',
            angle: outlineConfig?.angle,
          },
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create script-writing task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Add job to BullMQ queue
    const job = await scriptWritingQueue.add(
      'script-writing',
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        outlineData: outlineOutput,
        config: {
          topic: outlineConfig?.topic || video.idea,
          genre: outlineConfig?.genre || 'documentary',
          angle: outlineConfig?.angle,
        },
      },
      {
        jobId: task.id,
      }
    );

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id, task });
  } catch (error) {
    console.error("Failed to start script-writing task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
