/**
 * GPU Shutdown Checker Worker
 * ============================================================================
 * Monitors user VMs for inactivity and automatically shuts them down
 * when no GPU API calls have been made within the user's configured timeout.
 * 
 * Runs as a BullMQ repeatable job every 5 minutes.
 */

import { Job, Processor } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { stopNode } from '../../gcp/provision';
import { getValidGCPToken } from '../../gcp/token-refresh';

interface GCPConfig {
  user_id: string;
  project_id: string;
  status: string;
  last_gpu_activity_at: string | null;
  gpu_auto_shutdown_minutes: number;
}

/**
 * Check all running VMs for inactivity and shut down those that have exceeded
 * their configured timeout period.
 */
export async function checkForInactiveVMs(): Promise<{ checked: number; shutdown: number }> {
  console.log('[GPU Shutdown Checker] Starting inactivity check...');
  
  // Initialize Supabase with service role for full access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  
  // Find all running VMs
  const { data: runningVMs, error: queryError } = await supabase
    .from('user_gcp_config')
    .select('user_id, project_id, status, last_gpu_activity_at, gpu_auto_shutdown_minutes')
    .eq('status', 'RUNNING');
  
  if (queryError) {
    console.error('[GPU Shutdown Checker] Failed to query running VMs:', queryError.message);
    return { checked: 0, shutdown: 0 };
  }
  
  if (!runningVMs || runningVMs.length === 0) {
    console.log('[GPU Shutdown Checker] No running VMs found');
    return { checked: 0, shutdown: 0 };
  }
  
  console.log(`[GPU Shutdown Checker] Found ${runningVMs.length} running VM(s)`);
  
  const now = Date.now();
  let shutdownCount = 0;
  
  for (const vm of runningVMs as GCPConfig[]) {
    const { user_id, project_id, last_gpu_activity_at, gpu_auto_shutdown_minutes } = vm;
    
    // Skip if no activity timestamp (shouldn't happen, but safety check)
    if (!last_gpu_activity_at) {
      console.log(`[GPU Shutdown Checker] User ${user_id}: No activity timestamp, skipping`);
      continue;
    }
    
    const lastActivityTime = new Date(last_gpu_activity_at).getTime();
    const timeoutMs = (gpu_auto_shutdown_minutes || 60) * 60 * 1000;
    const inactiveMs = now - lastActivityTime;
    
    console.log(`[GPU Shutdown Checker] User ${user_id}:`);
    console.log(`  - Last activity: ${Math.round(inactiveMs / 60000)} minutes ago`);
    console.log(`  - Timeout: ${gpu_auto_shutdown_minutes || 60} minutes`);
    
    if (inactiveMs > timeoutMs) {
      console.log(`[GPU Shutdown Checker] User ${user_id}: INACTIVE - initiating shutdown`);
      
      try {
        // Get a valid GCP token for this user
        const gcpToken = await getValidGCPToken(user_id, null);
        
        // Stop the VM
        await stopNode(gcpToken, project_id);
        
        // Update status in DB
        await supabase
          .from('user_gcp_config')
          .update({ status: 'STOPPING' })
          .eq('user_id', user_id);
        
        console.log(`[GPU Shutdown Checker] User ${user_id}: VM shutdown initiated successfully`);
        shutdownCount++;
        
      } catch (shutdownError: any) {
        console.error(`[GPU Shutdown Checker] User ${user_id}: Failed to shutdown VM:`, shutdownError.message);
        
        // If token refresh failed, user may need to re-authenticate
        // Don't mark as error status, just log and continue
      }
    } else {
      const remainingMs = timeoutMs - inactiveMs;
      console.log(`[GPU Shutdown Checker] User ${user_id}: Still active (${Math.round(remainingMs / 60000)} min remaining)`);
    }
  }
  
  console.log(`[GPU Shutdown Checker] Check complete. Shutdown ${shutdownCount}/${runningVMs.length} VMs`);
  
  return { checked: runningVMs.length, shutdown: shutdownCount };
}

/**
 * BullMQ Processor for GPU shutdown checking
 */
export const gpuShutdownCheckProcessor: Processor = async (job: Job) => {
  console.log(`[GPU Shutdown Checker] Job ${job.id} started`);
  const result = await checkForInactiveVMs();
  return { success: true, ...result };
};

