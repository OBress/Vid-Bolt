import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { callGpuSystemStatus } from "@/lib/services/gpu-api-service";

/**
 * GET /api/gpu-api/system
 * 
 * Proxy to GPU API system status endpoint.
 */
export async function GET(request: NextRequest) {
  // Get user from session for auth check
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
  
  const result = await callGpuSystemStatus();
  
  if (result.success) {
    return NextResponse.json({
      success: true,
      data: result.data
    });
  } else {
    return NextResponse.json({
      success: false,
      error: result.error
    }, { status: 503 });
  }
}
