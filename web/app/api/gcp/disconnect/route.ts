import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearStoredTokens } from "@/lib/gcp/token-refresh";

/**
 * POST /api/gcp/disconnect
 * 
 * Disconnects the user's GCP account by clearing stored tokens.
 * This is a server-side operation to ensure tokens are properly removed.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await clearStoredTokens(user.id);
    
    return NextResponse.json({ 
      success: true, 
      message: "GCP account disconnected successfully" 
    });
  } catch (error: any) {
    console.error("[GCP Disconnect] Error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to disconnect" 
    }, { status: 500 });
  }
}
