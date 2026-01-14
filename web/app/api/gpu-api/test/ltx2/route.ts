import { NextRequest, NextResponse } from "next/server";
import { gpuLtx2CreateQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/ltx2
 * 
 * Triggers specialized LTX-2 video generation test via BullMQ.
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
    const { prompt, input_image_url, negative_prompt, duration_seconds, frame_rate, aspect_ratio, width, height, end_image_url, seed, enhance_prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt must be at least 3 characters" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating LTX-2 task for prompt: ${prompt.substring(0, 50)}...`);

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
        name: `GPU Test: LTX-2 Generation`,
        status: "pending",
        steps: [],
        input_data: { prompt, input_image_url, negative_prompt, duration_seconds, frame_rate, aspect_ratio, width, height, end_image_url, seed, enhance_prompt, testType: 'ltx2_generation' },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const job = await gpuLtx2CreateQueue.add('ltx2-create', {
      taskId: task.id,
      userId: user.id,
      prompt,
      input_image_url: input_image_url || undefined,
      negative_prompt: negative_prompt || undefined,
      duration_seconds: duration_seconds || 5.0,
      frame_rate: frame_rate || 24.0,
      aspect_ratio: aspect_ratio || '16:9',
      width: width || undefined,
      height: height || undefined,
      end_image_url: end_image_url || undefined,
      seed: seed || undefined,
      enhance_prompt: enhance_prompt || false,
    }, { jobId: task.id });

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("[GPUApiTest] LTX-2 generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
