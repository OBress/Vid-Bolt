import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// POST /api/tasks - Start a new writing task
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
    const { projectId, scriptType, idea, researchEnabled, numberOfChapters } = body;

    if (!scriptType || !idea) {
      return NextResponse.json(
        { error: "Missing required fields: scriptType, idea" },
        { status: 400 }
      );
    }

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
        project_id: projectId || null,
        type: "writing",  // Using new consolidated type
        name: `Writing: ${idea.substring(0, 50)}...`,
        status: "pending",
        steps: [],  // Initialize empty steps array
        input_data: { scriptType, idea, researchEnabled, numberOfChapters },
        output_data: {},  // Initialize empty output
      })
      .select()
      .single();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Trigger Inngest workflow
    await inngest.send({
      name: "writing/workflow.start",
      data: {
        taskId: task.id,
        userId: user.id,
        projectId,
        scriptType,
        idea,
        researchEnabled: researchEnabled ?? false,
        numberOfChapters: numberOfChapters ?? 5,
      },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Failed to start task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/tasks - List user's tasks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const includeSteps = searchParams.get("includeSteps") === "true";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Include steps in response if requested (for detailed task views)
    const selectFields = includeSteps 
      ? "id, name, type, status, current_phase, current_step, progress_percent, steps, created_at, updated_at"
      : "id, name, type, status, current_phase, current_step, progress_percent, created_at, updated_at";

    let query = supabase
      .from("tasks")
      .select(selectFields)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: data });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
