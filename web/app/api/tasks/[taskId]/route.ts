import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/queues/redis";
import type { Task } from "@/types/task";

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

// GET /api/tasks/[taskId] - Get task details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Fetch task
    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      console.error("Failed to fetch task:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({ task: task as Task });
  } catch (error) {
    console.error("Failed to fetch task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PIPELINE SUB-QUEUE NAMES
// ============================================================================
// Queues that the orchestrator dispatches child jobs to during production.
// Used to drain leftover child jobs when a task is cancelled.
const PIPELINE_CHILD_QUEUES = [
  "audio-workflow",
  "shot-planner",
  "asset-scout",
  "image-gen",
  "video-gen",
  "verifier",
  "image-edit",
];

// PATCH /api/tasks/[taskId] - Cancel a running task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();

    if (body.status !== "cancelled") {
      return NextResponse.json(
        { error: "Only status='cancelled' is supported" },
        { status: 400 }
      );
    }

    // Authenticate
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Verify ownership and fetch task data (need input_data.videoId for child job cleanup)
    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("id, status, input_data")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status === "completed" || task.status === "cancelled") {
      return NextResponse.json({ error: `Task already ${task.status}` }, { status: 409 });
    }

    // 1. Update Supabase task status to cancelled
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        status: "cancelled",
        current_step: "Cancelled by user",
        error_message: "Production stopped by user.",
      })
      .eq("id", taskId);

    if (updateError) {
      console.error("[TaskCancel] Failed to update task status:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[TaskCancel] Task ${taskId} marked as cancelled in Supabase`);

    // 2. Remove the orchestrator BullMQ job from Redis
    //    The closed-loop API sets jobId = taskId, so we can target it directly.
    let orchestratorRemoved = false;
    try {
      const connection = getRedisConnection();
      const orchestratorQueue = new Queue("orchestrator", { connection });
      const job = await orchestratorQueue.getJob(taskId);
      if (job) {
        // Use remove() which works for waiting/delayed jobs.
        // For active jobs, this fails silently — the orchestrator's cancellation
        // check (between phases) will catch it and self-terminate.
        try {
          await job.remove();
          orchestratorRemoved = true;
          console.log(`[TaskCancel] Removed orchestrator job ${taskId} from Redis`);
        } catch {
          // Job is likely active — the cancellation check will handle it
          console.log(`[TaskCancel] Orchestrator job ${taskId} is active — will self-terminate at next phase`);
        }
      } else {
        console.log(`[TaskCancel] No orchestrator job found for ${taskId} (already completed or removed)`);
      }
      await orchestratorQueue.close();
    } catch (redisErr) {
      // Non-blocking: Supabase cancel already succeeded
      console.warn("[TaskCancel] Redis cleanup error:", redisErr);
    }

    // 3. Drain child jobs for the same videoId from pipeline sub-queues
    const videoId = (task.input_data as Record<string, unknown>)?.videoId as string;
    let childJobsRemoved = 0;

    if (videoId) {
      const connection = getRedisConnection();
      for (const queueName of PIPELINE_CHILD_QUEUES) {
        try {
          const queue = new Queue(queueName, { connection });
          // Check waiting + delayed jobs and remove those matching our videoId
          const waitingJobs = await queue.getJobs(["waiting", "delayed"]);
          for (const job of waitingJobs) {
            if (job?.data?.videoId === videoId) {
              try {
                await job.remove();
                childJobsRemoved++;
              } catch {
                // Job may have started processing — that's fine
              }
            }
          }
          await queue.close();
        } catch (err) {
          console.warn(`[TaskCancel] Failed to clean ${queueName}:`, err);
        }
      }

      if (childJobsRemoved > 0) {
        console.log(`[TaskCancel] Removed ${childJobsRemoved} child jobs for video ${videoId}`);
      }
    }

    return NextResponse.json({
      success: true,
      orchestratorRemoved,
      childJobsRemoved,
    });
  } catch (error) {
    console.error("[TaskCancel] Failed to cancel task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
