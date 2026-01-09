import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/gpu-api/health
 * 
 * Proxy to GPU API health endpoints for real-time status checking.
 * Query params:
 * - ready: if "true", calls /health/ready instead of /health
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const checkReady = searchParams.get("ready") === "true";
  
  const gpuApiUrl = process.env.GPU_API_URL || "http://localhost:8000";
  const endpoint = checkReady ? "/health/ready" : "/health";
  
  try {
    const response = await fetch(`${gpuApiUrl}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    
    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      endpoint,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect to GPU API",
        endpoint,
        gpuApiUrl,
      },
      { status: 503 }
    );
  }
}
