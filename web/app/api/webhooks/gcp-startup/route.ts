import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // 1. Verify Request
  const body = await req.json();
  const { ip, user_id, status } = body;

  if (!user_id || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 2. Init Admin Client
  // We need Service Role to update rows on behalf of the user (or system) without a user session cookie.
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
      console.log(`[GCP Webhook] User: ${user_id}, IP: ${ip}, Status: ${status}`);
      
      // Upsert to gpu_nodes
      // Match on user_id and instance_name (assuming single instance 'vidbolt-workflow' for now)
      // If we supported multiple, we'd need instance_id in the payload.
      
      const updateData: any = {
          status: status === 'ready' ? 'RUNNING' : status.toUpperCase(),
          last_seen_at: new Date().toISOString()
      };
      
      if (ip) {
          updateData.external_ip = ip;
      }

      // We use 'vidbolt-workflow' as the fixed name for this DevTool prototype
      // Update user_gcp_config instead of gpu_nodes
      const { error } = await supabaseAdmin
        .from('user_gcp_config')
        .update(updateData)
        .eq('user_id', user_id);
        // .eq('instance_name', 'vidbolt-workflow'); // Optional if we enforce 1 config per user, which we do via Unique(user_id)

      if (error) {
          // If update fails (maybe row doesn't exist yet? It should have been created by provision), 
          // we could try insert, but provision should have handled it.
          console.error("DB Update Error", error);
          throw error;
      }
      
      return NextResponse.json({ success: true });
  } catch (err: any) {
      console.error("Webhook Error", err);
      return NextResponse.json({ error: "Processing failed: " + err.message }, { status: 500 });
  }
}

