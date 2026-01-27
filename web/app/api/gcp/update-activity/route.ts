import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/gcp/update-activity
 * Updates the last_gpu_activity_at timestamp for auto-shutdown tracking
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { error: updateError } = await supabase
      .from("user_gcp_config")
      .update({ 
        last_gpu_activity_at: new Date().toISOString() 
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[GCP Activity] Failed to update activity:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[GCP Activity] Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
