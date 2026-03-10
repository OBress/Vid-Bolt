import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clearStoredTokens } from "@/lib/gcp/token-refresh";

/**
 * POST /api/gcp/disconnect
 * 
 * Disconnects a user's GCP account by clearing stored tokens.
 * ADMIN-ONLY: Non-admin users cannot disconnect to protect the 100-user OAuth cap.
 * 
 * Body (optional): { targetUserId: string } - Admins can disconnect other users
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  const serviceSupabase = createServiceClient();
  const { data: userData } = await serviceSupabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!userData?.is_admin) {
    return NextResponse.json(
      { error: "Only admins can disconnect GCP accounts. Contact an admin for help." },
      { status: 403 }
    );
  }

  try {
    // Admins can disconnect other users via targetUserId
    let targetUserId = user.id;
    try {
      const body = await req.json();
      if (body.targetUserId) {
        targetUserId = body.targetUserId;
      }
    } catch {
      // No body or invalid JSON — disconnect self
    }

    await clearStoredTokens(targetUserId);
    
    return NextResponse.json({ 
      success: true, 
      message: `GCP account disconnected for user ${targetUserId}` 
    });
  } catch (error: any) {
    console.error("[GCP Disconnect] Error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to disconnect" 
    }, { status: 500 });
  }
}
