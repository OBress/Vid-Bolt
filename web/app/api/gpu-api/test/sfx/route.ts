import { NextRequest, NextResponse } from "next/server";
import { gpuSfxCreateQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/sfx
 * 
 * Triggers sound effect generation test via BullMQ.
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
    const { prompt, durationSeconds, seed } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt must be at least 3 characters" },
        { status: 400 }
      );
    }

    // Validate duration (1-30 seconds)
    const duration = durationSeconds ?? 5;
    if (duration < 1 || duration > 30) {
      return NextResponse.json(
        { error: "Duration must be between 1 and 30 seconds" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating sound effect task for prompt: ${prompt.substring(0, 50)}...`);

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
        name: `GPU Test: Sound Effect`,
        status: "pending",
        steps: [],
        input_data: { prompt, durationSeconds: duration, seed, testType: 'sfx_generation' },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuSfxCreateQueue.add('sfx-create', {
      taskId: task.id,
      userId: user.id,
      prompt,
      durationSeconds: duration,
      seed: seed || undefined,
    }, { jobId: task.id });

    console.log(`[GPUApiTest] Triggered sound effect test for task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] Sound effect error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
