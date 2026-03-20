/**
 * GPU API Webhook Callback Handler
 * ============================================================================
 * Receives webhook callbacks from the GPU API when jobs complete.
 * Verifies HMAC signature if webhook_secret was provided.
 * Publishes results to Redis for real-time UI updates.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRedisConnection } from "@/lib/queues/redis";
import type { WebhookPayload } from "@/lib/services/gpu-api-service";
import { getKeyFromUrl, getPublicUrl } from "@/lib/services/r2-storage";
import { verifySignature } from "@/lib/utils/signature-verification";

// Channel name for webhook result pub/sub
const WEBHOOK_CHANNEL = "gpu-webhook-results";

/**
 * POST /api/gpu-callback
 * 
 * Receives webhook callbacks from GPU API.
 * Headers:
 *   - X-Webhook-Signature: HMAC-SHA256 signature (if webhook_secret was provided)
 *   - X-Webhook-Event: "generation.completed" or "generation.failed"
 *   - X-Job-Id: The job ID
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    
    // Verify signature
    const signature = request.headers.get("X-Webhook-Signature");
    const webhookSecret = process.env.GPU_WEBHOOK_SECRET;
    
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.error("[GPUCallback] Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse payload
    const payload: WebhookPayload = JSON.parse(rawBody);
    
    console.log(`[GPUCallback] Received ${payload.event} for job ${payload.job_id} (item: ${payload.item_id}${payload.status === 'cancelled' ? ' — CANCELLED' : ''})`);

    // Extract key information
    const result = {
      event: payload.event,
      jobId: payload.job_id,
      itemId: payload.item_id,
      batchId: payload.batch_id,
      status: payload.status,
      completedAt: payload.completed_at,
      generationType: payload.generation_type,
      result: payload.result,
      errorMessage: payload.error_message,
      errorCode: payload.error_code,
      retryCount: payload.retry_count,
      receivedAt: Date.now(),
    };

    // Publish to Redis for real-time updates (workers listen to this)
    try {
      const redis = getRedisConnection();
      await redis.publish(WEBHOOK_CHANNEL, JSON.stringify(result));
      console.log(`[GPUCallback] Published result to Redis channel: ${WEBHOOK_CHANNEL}`);
    } catch (redisError) {
      // Log but don't fail - webhook was still received
      console.error("[GPUCallback] Failed to publish to Redis:", redisError);
    }

    // Update task status in Supabase (for UI polling to stop)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
        if (supabaseUrl && supabaseKey && payload.item_id) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const isSuccess = payload.status === 'completed';
        
        // FIX: Ensure we use the public URL (custom domain) not the internal R2 URL
        // The GPU API returns the internal R2 URL (r2.cloudflarestorage.com)
        // We need to convert this to our custom domain public URL
        let finalUrl = payload.result?.save_url;
        if (isSuccess && finalUrl) {
          try {
            const key = getKeyFromUrl(finalUrl);
            finalUrl = getPublicUrl(key);
          } catch (e) {
            console.error("[GPUCallback] Failed to sanitize URL:", e);
            // Fallback to original URL if parsing fails
          }
        }
        
        await supabase.from('tasks').update({
          status: isSuccess ? 'completed' : 'failed',
          current_step: isSuccess ? 'Complete' : 'Failed',
          progress_percent: isSuccess ? 100 : 0,
          output_data: {
            success: isSuccess,
            type: payload.generation_type,
            imageUrl: finalUrl,
            videoUrl: finalUrl,
            generationTime: payload.result?.generation_time,
            error: payload.error_message,
          },
        }).eq('id', payload.item_id);
        
        console.log(`[GPUCallback] Updated task ${payload.item_id} status to ${isSuccess ? 'completed' : 'failed'}`);
      }
    } catch (dbError) {
      // Log but don't fail - Redis was still notified
      console.error("[GPUCallback] Failed to update Supabase:", dbError);
    }

    const duration = Date.now() - startTime;
    console.log(`[GPUCallback] Processed webhook in ${duration}ms`);

    // Return success immediately
    return NextResponse.json({ 
      success: true, 
      message: "Webhook received",
      processingTime: duration 
    });

  } catch (error) {
    console.error("[GPUCallback] Error processing webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gpu-callback
 * 
 * Health check endpoint to verify the callback URL is accessible.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GPU webhook callback endpoint is ready",
    timestamp: new Date().toISOString(),
  });
}
