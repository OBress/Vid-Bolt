import { NextRequest, NextResponse } from "next/server";
import { callGpuHealth, callGpuHealthReady } from "@/lib/services/gpu-api-service";

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
  
  if (checkReady) {
    const result = await callGpuHealthReady();
    if (result.success) {
      return NextResponse.json({
        success: true,
        endpoint: "/health/ready",
        data: result.data
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        endpoint: "/health/ready"
      }, { status: 503 });
    }
  } else {
    const result = await callGpuHealth();
    if (result.success) {
      return NextResponse.json({
        success: true,
        endpoint: "/health",
        data: result.data
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        endpoint: "/health"
      }, { status: 503 });
    }
  }
}
