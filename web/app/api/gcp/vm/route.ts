import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stopNode, startNode, getNodeStatus } from "@/lib/gcp/provision";
import { gcpProvisioningQueue } from "@/lib/queues/queues";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Let's assume the CLIENT sends the GCP Access Token in a custom header 'x-gcp-token'
  const gcpToken = req.headers.get("x-gcp-token");
  if (!gcpToken) {
     return NextResponse.json({ error: "Missing GCP Token. Please Connect Google Account again." }, { status: 400 });
  }

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
    if (!projectId && action !== "validate") {
         return NextResponse.json({ error: "Missing Project ID" }, { status: 400 });
    }

    let result;
    
    if (action === "provision") {
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
        await supabase.from("user_gcp_config").update({ status: 'STAGING' }).eq('user_id', userId);
    } else if (action === "status") {
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
