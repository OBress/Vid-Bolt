import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * GET /api/gpu-api/test/batch/status?batchId=xxx
 *
 * Get batch status by querying Supabase tasks with matching batchId.
 * Since batches are now processed via BullMQ workers, status comes from tasks table.
 */
export async function GET(request: NextRequest) {
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

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json(
        { error: "batchId parameter required" },
        { status: 400 }
      );
    }

    // Query Supabase for all tasks with this batchId in input_data
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query tasks where input_data->batchId matches
    const { data: tasks, error: queryError } = await supabase
      .from("tasks")
      .select("id, status, current_step, progress_percent, input_data, output_data, created_at, updated_at")
      .eq("user_id", user.id)
      .contains("input_data", { batchId })
      .order("created_at", { ascending: true });

    if (queryError) {
      console.error("[GPUApiTest] Batch status query error:", queryError);
      return NextResponse.json(
        { error: "Failed to query batch status" },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json(
        { error: "Batch not found" },
        { status: 404 }
      );
    }

    // Aggregate status
    const totalItems = tasks.length;
    const completedItems = tasks.filter(t => t.status === "completed").length;
    const failedItems = tasks.filter(t => t.status === "failed").length;
    const pendingItems = tasks.filter(t => t.status === "pending").length;
    const processingItems = tasks.filter(t => t.status === "running").length;

    // Determine overall batch status
    let batchStatus: "pending" | "processing" | "completed" | "failed" | "partial";
    if (completedItems + failedItems === totalItems) {
      batchStatus = failedItems > 0 && completedItems > 0 ? "partial" 
                  : failedItems === totalItems ? "failed" 
                  : "completed";
    } else if (processingItems > 0 || completedItems > 0) {
      batchStatus = "processing";
    } else {
      batchStatus = "pending";
    }

    // Build items array with status for each
    const items = tasks.map((task) => ({
      itemId: `${batchId}_item_${task.input_data?.itemIndex ?? 0}`,
      taskId: task.id,
      status: task.status,
      currentStep: task.current_step,
      progressPercent: task.progress_percent,
      result: task.output_data,
      itemIndex: task.input_data?.itemIndex ?? 0,
    }));
    
    // Debug logging
    console.log(`[GPUApiTest] Batch status for ${batchId}:`);
    console.log(`[GPUApiTest]   Total: ${totalItems}, Completed: ${completedItems}, Failed: ${failedItems}, Pending: ${pendingItems}`);
    console.log(`[GPUApiTest]   Items:`, items.map(i => ({ taskId: i.taskId, status: i.status, itemIndex: i.itemIndex })));

    return NextResponse.json({
      success: true,
      batch: {
        batchId,
        status: batchStatus,
        totalItems,
        completedItems,
        failedItems,
        pendingItems,
        processingItems,
        progressPercent: Math.round((completedItems + failedItems) / totalItems * 100),
        items,
      },
    });
  } catch (error) {
    console.error("[GPUApiTest] Batch status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gpu-api/test/batch/status?batchId=xxx
 *
 * Cancel/delete batch tasks.
 */
export async function DELETE(request: NextRequest) {
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

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json(
        { error: "batchId parameter required" },
        { status: 400 }
      );
    }

    // Mark all pending tasks as cancelled
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update pending tasks to cancelled
    const { data: tasks, error: updateError } = await supabase
      .from("tasks")
      .update({ status: "failed", current_step: "Cancelled by user" })
      .eq("user_id", user.id)
      .contains("input_data", { batchId })
      .in("status", ["pending", "running"])
      .select();

    if (updateError) {
      console.error("[GPUApiTest] Batch delete error:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel batch" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cancelled ${tasks?.length || 0} pending tasks`,
      batchId,
    });
  } catch (error) {
    console.error("[GPUApiTest] Batch delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
