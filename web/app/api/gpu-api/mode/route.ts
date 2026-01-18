import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { callGpuGetMode, callGpuSwitchMode } from "@/lib/services/gpu-api-service";

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
  
  const result = await callGpuGetMode();
  
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

export async function POST(request: NextRequest) {
  const { user, authError } = await getAuth();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { targetMode } = body;
    
    // Basic validation
    if (!targetMode || !["image", "video"].includes(targetMode)) {
      return NextResponse.json(
        { error: "Invalid targetMode. Must be 'image' or 'video'" },
        { status: 400 }
      );
    }
    
    // Type assertion is safe here due to check above
    const result = await callGpuSwitchMode(targetMode as "image" | "video");
    
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
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid request body",
      },
      { status: 400 }
    );
  }
}
