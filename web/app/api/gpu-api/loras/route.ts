import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Configure route for large file uploads (LoRAs can be 200MB+)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Disable default body size limit for this route
export const maxDuration = 300; // 5 minutes timeout for large uploads

/**
 * GET /api/gpu-api/loras
 * 
 * Get list of available Z-Image LoRAs from the GPU API.
 */
export async function GET() {
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
    const response = await fetch(`${gpuApiUrl}/api/v1/loras/z-image`, {
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

/**
 * POST /api/gpu-api/loras
 * 
 * Upload a new Z-Image LoRA (.safetensors file) to the GPU API.
 */
export async function POST(request: NextRequest) {
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
    // Get content type header
    const contentType = request.headers.get("content-type") || "";
    
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 400 });
    }
    
    // Stream the request body directly to the GPU API
    // This bypasses Next.js parsing limits and avoids double-buffering large files
    console.log(`[LoRA Upload] Streaming upload to GPU API...`);
    
    const response = await fetch(`${gpuApiUrl}/api/v1/loras/z-image/upload`, {
      method: "POST",
      headers: {
        "Content-Type": contentType, // Preserve multipart boundary
        "X-API-Key": gpuApiKey,
      },
      body: request.body,
      // @ts-expect-error - duplex is required for streaming bodies in node fetch but types might be missing
      duplex: 'half', 
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error(`[LoRA Upload] GPU API error: ${response.status}`, data);
        return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      statusCode: response.status,
      data,
    });
  } catch (error) {
    console.error("[LoRA Upload] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload to GPU API",
      },
      { status: 503 }
    );
  }
}

/**
 * DELETE /api/gpu-api/loras?name=loraName
 * 
 * Delete a Z-Image LoRA from the GPU API.
 */
export async function DELETE(request: NextRequest) {
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
  
  const loraName = request.nextUrl.searchParams.get("name");
  
  if (!loraName) {
    return NextResponse.json({ error: "Missing lora name" }, { status: 400 });
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
    const response = await fetch(`${gpuApiUrl}/api/v1/loras/z-image/${encodeURIComponent(loraName)}`, {
      method: "DELETE",
      headers: {
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
