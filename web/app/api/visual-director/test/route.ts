import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/visual-director/test
 * 
 * Triggers the Visual Director test Inngest workflow.
 * Takes raw script text and returns a task ID for polling.
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
    const { scriptText } = body;

    if (!scriptText || typeof scriptText !== 'string' || scriptText.trim().length < 50) {
      return NextResponse.json(
        { error: "Script text must be at least 50 characters" },
        { status: 400 }
      );
    }

    console.log(`[VisualDirectorTest] Creating task for ${scriptText.length} character script`);

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
        type: "writing", // Must be one of: writing, writing_workflow, audio, video, export
        name: `AV Script Test: ${scriptText.substring(0, 30)}...`,
        status: "pending",
        steps: [],
        input_data: { scriptText: scriptText.substring(0, 10000), isAVScriptTest: true },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("[VisualDirectorTest] Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Trigger Inngest workflow
    await inngest.send({
      name: "visual-director/test.start",
      data: {
        taskId: task.id,
        userId: user.id,
        scriptText,
      },
    });

    console.log(`[VisualDirectorTest] Triggered workflow for task ${task.id}`);

    return NextResponse.json({ 
      success: true, 
      taskId: task.id,
    });
  } catch (error) {
    console.error("[VisualDirectorTest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/visual-director/test?taskId=xxx
 * 
 * Poll for task status and results.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error } = await supabase
      .from("tasks")
      .select("status, current_step, progress_percent, output_data")
      .eq("id", taskId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      status: task.status,
      currentStep: task.current_step,
      progress: task.progress_percent,
      output: task.output_data,
    });
  } catch (error) {
    console.error("[VisualDirectorTest] GET Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
