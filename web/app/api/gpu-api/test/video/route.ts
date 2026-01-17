import { NextRequest, NextResponse } from "next/server";
import { gpuVideoCreateQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/video
 * 
 * Triggers single video creation test via BullMQ.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { prompt, startFrameUrl, durationSeconds, fps, aspectRatio, endFrameUrl, seed, width, height, webhook_url } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt must be at least 3 characters" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating video creation task for prompt: ${prompt.substring(0, 50)}...`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "video",
        name: `GPU Test: Video Creation`,
        status: "pending",
        steps: [],
        input_data: { prompt, startFrameUrl, durationSeconds, fps, aspectRatio, endFrameUrl, seed, width, height, webhook_url, testType: 'video_creation' },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuVideoCreateQueue.add('video-create', {
      taskId: task.id,
      userId: user.id,
      prompt,
      startFrameUrl: startFrameUrl || undefined,
      durationSeconds: durationSeconds || 4.0,
      fps: fps || 24,
      aspectRatio: aspectRatio || '16:9',
      width: width || undefined,
      height: height || undefined,
      endFrameUrl: endFrameUrl || undefined,
      seed: seed || undefined,
    }, { jobId: task.id });

    console.log(`[GPUApiTest] Triggered video creation test for task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] Video creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
