import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // 1. Parse Request
  const body = await req.json();
  const { ip, user_id, status, message } = body;

  if (!user_id || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 2. Init Admin Client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  
  try {
      console.log(`[GCP Webhook] User: ${user_id}, IP: ${ip}, Status: ${status}, Msg: ${message || 'N/A'}`);
      
      // Build update payload
      const updateData: any = {
          status: status === 'ready' ? 'RUNNING' : status.toUpperCase(),
          last_seen_at: new Date().toISOString(),
          // Reset activity timestamp when VM becomes ready to prevent immediate shutdown
          // from stale timestamps left over from previous sessions
          ...(status === 'ready' && { last_gpu_activity_at: new Date().toISOString() })
      };
      
      if (ip) {
          updateData.external_ip = ip;
      }

      // Also append the message to logs in metadata
      // 1. Fetch current metadata
      const { data: currentConfig } = await supabaseAdmin
        .from('user_gcp_config')
        .select('metadata')
        .eq('user_id', user_id)
        .single();
      
      const currentMetadata = currentConfig?.metadata || {};
      const currentLogs = Array.isArray(currentMetadata.logs) ? currentMetadata.logs : [];
      const logEntry = `[${new Date().toLocaleTimeString()}] (VM) ${status}: ${message || 'No message'}`;
      const newLogs = [logEntry, ...currentLogs].slice(0, 50);
      
      updateData.metadata = {
          ...currentMetadata,
          logs: newLogs,
          last_log: `${status}: ${message || ''}`
      };

      // Update user_gcp_config
      const { error } = await supabaseAdmin
        .from('user_gcp_config')
        .update(updateData)
        .eq('user_id', user_id);

      if (error) {
          console.error("DB Update Error", error);
          throw error;
      }
      
      // ════════════════════════════════════════════════════════════════════════
      // DISPATCH PENDING GPU JOBS when VM becomes ready
      // ════════════════════════════════════════════════════════════════════════
      if (status === 'ready') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const internalSecret = process.env.INTERNAL_API_SECRET;
        
        if (internalSecret) {
          console.log(`[GCP Webhook] Triggering pending GPU job dispatch for user ${user_id}`);
          
          // Fire-and-forget: dispatch pending jobs
          fetch(`${appUrl}/api/internal/dispatch-pending-gpu-jobs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': internalSecret,
            },
            body: JSON.stringify({ user_id }),
          })
            .then(res => res.json())
            .then(data => {
              console.log(`[GCP Webhook] Dispatch result: ${data.dispatched || 0} jobs dispatched`);
            })
            .catch(err => {
              console.error('[GCP Webhook] Failed to dispatch pending jobs:', err);
            });
        } else {
          console.warn('[GCP Webhook] INTERNAL_API_SECRET not set, skipping job dispatch');
        }
      }
      
      return NextResponse.json({ success: true });
  } catch (err: any) {
      console.error("Webhook Error", err);
      return NextResponse.json({ error: "Processing failed: " + err.message }, { status: 500 });
  }
}
