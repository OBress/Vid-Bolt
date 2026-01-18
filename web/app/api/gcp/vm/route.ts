import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionNode, stopNode, startNode, getNodeStatus } from "@/lib/gcp/provision";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract provider token
  // Note: Supabase session might not expose provider_token directly in strict TS types of getSession
  // but it is often available in session used or requires a fresh signInWithOAuth.
  // For this prototype, we assume it's available or passed in header if needed.
  // Actually, 'session.provider_token' is deprecated/moved. The correct way is usually checking if `session.provider_token` exists or handling it on sign-in.
  // For this "Dev Tools" implementation, we will try to access it from the session object cast as any if necessary, or require the client to pass it.
  
  // STRATEGY CHANGE: The client-side signInWithOAuth returns the token. 
  // We will expect the client to pass the provider access token in the Authorization header as Bearer <gcp_token> 
  // OR we rely on simple `session` if we stored it (Supabase usually stores it in `auth.identities` or `auth.sessions` but simpler to pass from client for now).
  
  // Let's assume the CLIENT sends the GCP Access Token in a custom header 'x-gcp-token' to separate from Supabase Auth.
  const gcpToken = req.headers.get("x-gcp-token");
  if (!gcpToken) {
     return NextResponse.json({ error: "Missing GCP Token. Please Connect Google Account again." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { action, projectId } = body; // Get projectId from body
    const userId = session.user.id;
    // Helper to get base URL for webhook
    const webhookUrl = `${new URL(req.url).origin}/api/webhooks/gcp-startup`;

    // Validate ProjectID
    if (!projectId) {
         return NextResponse.json({ error: "Missing Project ID" }, { status: 400 });
    }

    let result;
        if (action === "provision") {
        result = await provisionNode(gcpToken, userId, webhookUrl, projectId);
        // Persist to DB (Upsert config with new state)
        await supabase.from("user_gcp_config").upsert({
            user_id: userId,
            project_id: projectId,
            instance_name: "vidbolt-workflow",
            status: 'PROVISIONING',
            metadata: result,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    } else if (action === "stop") {
        result = await stopNode(gcpToken, projectId);
        await supabase.from("user_gcp_config").update({ status: 'STOPPING' }).eq('user_id', userId);
    } else if (action === "start") {
        result = await startNode(gcpToken, projectId);
        // Optimistic update
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
    } else {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("GCP Operation Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
