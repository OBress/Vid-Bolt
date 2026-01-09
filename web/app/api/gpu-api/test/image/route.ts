import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/gpu-api/test/image
 * 
 * Triggers single image creation test via Inngest.
 * Supports all parameters from the GPU API documentation.
 */
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
    const { prompt, aspectRatio, numInferenceSteps, seed, width, height } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt must be at least 3 characters" },
        { status: 400 }
      );
    }

    console.log(`[GPUApiTest] Creating image creation task for prompt: ${prompt.substring(0, 50)}...`);

    // Create task in database using service role
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
        type: "video", // GPU tasks are video type
        name: `GPU Test: Image Creation`,
        status: "pending",
        steps: [],
        input_data: { 
          prompt, 
          aspectRatio, 
          numInferenceSteps,
          seed,
          width,
          height,
          testType: 'image_creation' 
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[GPUApiTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Trigger Inngest workflow
    await inngest.send({
      name: "gpu-api/test-image.create",
      data: {
        taskId: task.id,
        userId: user.id,
        prompt,
        aspectRatio: aspectRatio || '16:9',
        numInferenceSteps: numInferenceSteps || 20,
        seed: seed || null,
        width,
        height,
      },
    });

    console.log(`[GPUApiTest] Triggered image creation test for task ${task.id}`);

    return NextResponse.json({ 
      success: true, 
      taskId: task.id,
    });
  } catch (error) {
    console.error("[GPUApiTest] Image creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
