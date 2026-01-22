import { NextRequest, NextResponse } from "next/server";
import { avScriptQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/process/av-script-part2
 * 
 * Start AV script Part 2 generation (detailed visual prompts + placeholder media).
 * This takes the shots from Part 1 and generates:
 * - Detailed visual prompts for each shot
 * - Placeholder GeneratedMedia entries ready for VM hookup
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
    const { 
      videoId,
      shots,
      outlineAssets,
    } = body;

    if (!videoId || !shots || shots.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: videoId, shots" },
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
        type: "av_script_part2",
        name: `AV Script Part 2: Media Generation`,
        status: "pending",
        steps: [],
        input_data: { 
          videoId,
          shots,
          outlineAssets,
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create AV script part2 task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Add job to BullMQ queue with 'part2' job name
    const job = await avScriptQueue.add(
      'av-script-part2',  // Job name - distinguishes from part1
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        shots,
        outlineAssets,
        mode: 'part2',  // Explicitly mark as Part 2
      },
      {
        jobId: task.id,
      }
    );

    console.log(`[AV Script Part2 API] Created task ${task.id}, job ${job.id}`);

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id });
  } catch (error) {
    console.error("Failed to start AV script part2 task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
