import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  
  const gpuApiUrl = process.env.GPU_API_URL || "http://localhost:8000";
  const gpuApiKey = process.env.GPU_API_KEY;
  
  if (!gpuApiKey) {
    return NextResponse.json(
      { error: "GPU_API_KEY not configured" },
      { status: 500 }
    );
  }
  
  try {
    const response = await fetch(`${gpuApiUrl}/api/v1/system/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": gpuApiKey,
      },
    });

    const data = await response.json();
    
    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect to GPU API",
        gpuApiUrl,
      },
      { status: 503 }
    );
  }
}
