/**
 * Health Check Endpoint
 * ============================================================================
 * Used by Docker health checks and the CI/CD deploy verification step.
 * Returns 200 if Redis is connected, 503 otherwise.
 */

import { NextResponse } from "next/server";
import { isRedisReady } from "@/lib/queues/redis";

export async function GET() {
  try {
    const redisOk = await isRedisReady();

    return NextResponse.json(
      {
        status: redisOk ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        redis: redisOk ? "connected" : "disconnected",
        version: process.env.COMMIT_SHA || "unknown",
      },
      { status: redisOk ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
