import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stopNode, startNode, getNodeStatus } from "@/lib/gcp/provision";
import { gcpProvisioningQueue } from "@/lib/queues/queues";
import { getValidGCPToken } from "@/lib/gcp/token-refresh";
import { gcpLimiter } from "@/lib/utils/rate-limiters";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check
  const rateLimited = gcpLimiter.check(user.id);
  if (rateLimited) return rateLimited;

  try {
    // Check if body exists
    const textCtx = await req.text();
    if (!textCtx) {
        return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    const body = JSON.parse(textCtx);
    const { action, projectId } = body;
    const userId = user.id;
    const webhookUrl = `${new URL(req.url).origin}/api/webhooks/gcp-startup`;

    // Validate ProjectID (required for most actions)
    if (!projectId && action !== "validate" && action !== "check-connection") {
         return NextResponse.json({ error: "Missing Project ID" }, { status: 400 });
    }

    // =====================================================
    // GET VALID GCP TOKEN (Session or Refresh)
    // =====================================================
    // First try the header token (from active session)
    // If not available, use stored refresh token
    const headerToken = req.headers.get("x-gcp-token");
    let gcpToken: string;
    
    try {
      gcpToken = await getValidGCPToken(userId, headerToken);
    } catch (tokenError: any) {
      // Special case: check-connection action should not fail
      if (action === "check-connection") {
        return NextResponse.json({ 
          success: true, 
          data: { connected: false, reason: tokenError.message } 
        });
      }
      return NextResponse.json({ 
        error: tokenError.message || "Missing GCP Token. Please reconnect your Google account." 
      }, { status: 401 });
    }

    let result;
    
    // =====================================================
    // ACTIONS
    // =====================================================
    
    if (action === "check-connection") {
      // Check if user has valid stored token or session token
      return NextResponse.json({ 
        success: true, 
        data: { connected: true } 
      });
    } else if (action === "provision") {
        // Enqueue background job (BullMQ)
        const job = await gcpProvisioningQueue.add('provision-node', {
            gcpToken,
            userId,
            projectId,
            webhookUrl
        });

        // Initialize status in DB immediately
        await supabase.from("user_gcp_config").upsert({
            user_id: userId,
            project_id: projectId,
            instance_name: "vidbolt-workflow",
            status: 'PROVISIONING',
            // Reset activity timestamp to prevent shutdown checker from using stale values
            last_gpu_activity_at: new Date().toISOString(),
            metadata: { 
                jobId: job.id, 
                logs: ["[System] Provisioning Job Queued..."] 
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        
        result = { status: 'QUEUED', jobId: job.id };
    } else if (action === "stop") {
        result = await stopNode(gcpToken, projectId);
        await supabase.from("user_gcp_config").update({ status: 'STOPPING' }).eq('user_id', userId);
    } else if (action === "start") {
        result = await startNode(gcpToken, projectId);
        // Reset activity timestamp when starting to prevent immediate shutdown from stale values
        await supabase.from("user_gcp_config").update({ 
            status: 'STAGING',
            last_gpu_activity_at: new Date().toISOString()
        }).eq('user_id', userId);
    } else if (action === "status") {
        try {
          result = await getNodeStatus(gcpToken, projectId);
          // Update DB with latest status if successful
          if (result && result.status !== "NOT_FOUND") {
               await supabase.from("user_gcp_config").update({ 
                   status: result.status,
                   external_ip: result.ip,
                   last_seen_at: new Date().toISOString()
               }).eq('user_id', userId);
          } else {
               // Handle Not Found (maybe terminated outside of app)
               await supabase.from("user_gcp_config").update({ 
                   status: 'TERMINATED',
                   external_ip: null
               }).eq('user_id', userId);
          }
        } catch (statusError: any) {
          console.error("[GCP VM Status] Failed to fetch VM status:", statusError.message);
          return NextResponse.json({
            success: false,
            error: `GCP status check failed: ${statusError.message}`,
          }, { status: 502 });
        }
    } else if (action === "validate") {
        // Validate if project ID is accessible using Compute API (we already have this scope)
        if (!projectId) {
            return NextResponse.json({ success: true, data: { valid: false, error: "No project ID provided" } });
        }
        try {
            // Use the Compute API to check project access by trying to list zones
            const { ZonesClient } = await import('@google-cloud/compute');
            const { getGCPAuthClient } = await import('@/lib/gcp/auth');
            const authClient = await getGCPAuthClient(gcpToken);
            const zonesClient = new ZonesClient({ authClient });
            
            // Just try to list zones - if it works, project is accessible
            const [zones] = await zonesClient.list({ project: projectId, maxResults: 1 });
            result = { valid: true, zoneCount: zones?.length || 0 };
        } catch (validationError: any) {
            console.log("Project validation failed:", validationError.message);
            result = { valid: false, error: validationError.message };
        }
    } else {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("GCP Operation Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
