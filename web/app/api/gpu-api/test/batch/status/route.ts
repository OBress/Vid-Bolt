import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  callGpuGetBatchStatus,
  callGpuDeleteBatch,
} from "@/lib/services/gpu-api-service";

/**
 * GET /api/gpu-api/test/batch/status?batchId=xxx
 *
 * Poll for batch status from the GPU API.
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

    const result = await callGpuGetBatchStatus(batchId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to get batch status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batch: result.batch,
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
 * Collect batch results and delete the batch (for final retrieval).
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

    const result = await callGpuDeleteBatch(batchId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete batch" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batch: result.batch,
    });
  } catch (error) {
    console.error("[GPUApiTest] Batch delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
