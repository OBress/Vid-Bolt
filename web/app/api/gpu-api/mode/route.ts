import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * GET /api/gpu-api/mode
 * 
 * Get current GPU API mode status.
 * 
 * POST /api/gpu-api/mode
 * 
 * Switch between image and video modes.
 * Body: { targetMode: "image" | "video" }
 */

async function getAuth() {
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
  return { user, authError };
}

export async function GET() {
  const { user, authError } = await getAuth();
  
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
    const response = await fetch(`${gpuApiUrl}/api/v1/mode`, {
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
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, authError } = await getAuth();
  
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
    const body = await request.json();
    const { targetMode } = body;
    
    if (!targetMode || !["image", "video"].includes(targetMode)) {
      return NextResponse.json(
        { error: "Invalid targetMode. Must be 'image' or 'video'" },
        { status: 400 }
      );
    }
    
    const response = await fetch(`${gpuApiUrl}/api/v1/mode/switch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": gpuApiKey,
      },
      body: JSON.stringify({ target_mode: targetMode }),
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
      },
      { status: 503 }
    );
  }
}
