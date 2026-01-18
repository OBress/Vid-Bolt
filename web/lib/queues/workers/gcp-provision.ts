/**
 * GCP Provisioning Worker
 * ============================================================================
 * Handles the background provisioning of Google Cloud GPU nodes.
 */

import { Job, Processor } from 'bullmq';
import { provisionNode, ensureFirewallRule, ensureIAPSSHRule } from '@/lib/gcp/provision';
import { getSupabaseServiceClient } from '../shared';

export interface GcpProvisionJobData {
  gcpToken: string;
  userId: string;
  projectId: string;
  webhookUrl: string;
}

// Helper to append logs to user_gcp_config
async function logToGcpConfig(userId: string, message: string) {
  const supabase = getSupabaseServiceClient();
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}`;

  console.log(`[GCPWorker] ${userId}: ${message}`);

  // Fetch current metadata to append logs
  const { data } = await supabase
    .from('user_gcp_config')
    .select('metadata')
    .eq('user_id', userId)
    .single();
  
  const currentMetadata = data?.metadata || {};
  const currentLogs = Array.isArray(currentMetadata.logs) ? currentMetadata.logs : [];
  
  // Keep last 50 logs
  const newLogs = [logEntry, ...currentLogs].slice(0, 50);

  await supabase.from('user_gcp_config').update({
    metadata: {
      ...currentMetadata,
      logs: newLogs,
      last_log: message
    },
    updated_at: new Date().toISOString()
  }).eq('user_id', userId);
}

export const gcpProvisionProcessor: Processor<GcpProvisionJobData> = async (job: Job<GcpProvisionJobData>) => {
  const { gcpToken, userId, projectId, webhookUrl } = job.data;

  // Initial update
  await logToGcpConfig(userId, "Starting Provisioning Workflow...");
  
  try {
    const supabase = getSupabaseServiceClient();

    // 1. Status: Provisioning
    await supabase.from("user_gcp_config").update({ 
        status: 'PROVISIONING',
        instance_name: "vidbolt-workflow"
    }).eq('user_id', userId);

    // 2. Ensure Firewall Rule exists for port 8000
    await logToGcpConfig(userId, "Checking firewall rules for port 8000...");
    const firewallResult = await ensureFirewallRule(gcpToken, projectId);
    if (firewallResult.created) {
        await logToGcpConfig(userId, "Firewall rule created for port 8000.");
    } else {
        await logToGcpConfig(userId, "Firewall rule for port 8000 already exists.");
    }

    // 2b. Ensure IAP SSH firewall rule exists (for browser-based SSH)
    await logToGcpConfig(userId, "Checking IAP SSH firewall rule...");
    const iapResult = await ensureIAPSSHRule(gcpToken, projectId);
    if (iapResult.created) {
        await logToGcpConfig(userId, "IAP SSH firewall rule created.");
    } else {
        await logToGcpConfig(userId, "IAP SSH firewall rule already exists.");
    }

    // 3. Create or Start VM Instance
    await logToGcpConfig(userId, "Checking existing VM or creating new one...");
    const operation = await provisionNode(gcpToken, userId, webhookUrl, projectId);

    // provisionNode returns:
    // - null if VM is already RUNNING/STAGING/PROVISIONING
    // - start operation if VM was STOPPED/TERMINATED
    // - insert operation if VM didn't exist
    if (operation === null) {
      await logToGcpConfig(userId, "VM is already running. Nothing to do.");
      await supabase.from("user_gcp_config").update({ 
        status: 'RUNNING'
      }).eq('user_id', userId);
      return { success: true, alreadyRunning: true };
    }

    await logToGcpConfig(userId, "Request accepted by Google. Waiting for resources...");

    // Wait for Operation Completion (Infrastructure created or started)
    if (operation && typeof operation.promise === 'function') {
         await operation.promise();
    }

    await logToGcpConfig(userId, "Infrastructure resources allocated. VM is booting...");
    
    // 4. Update Status to STAGING (waiting for webhook)
    await supabase.from("user_gcp_config").update({ 
         status: 'STAGING',
         external_ip: null // IP comes later via webhook or poll
    }).eq('user_id', userId);

    await logToGcpConfig(userId, "Waiting for startup script to signal readiness...");

    // The job is done here; the rest is handled by webhook callbacks.
    return { success: true };

  } catch (error: any) {
    const msg = error.message || "Unknown error";
    await logToGcpConfig(userId, `Provisioning FAILED: ${msg}`);
    
    const supabase = getSupabaseServiceClient();
    await supabase.from("user_gcp_config").update({ 
         status: 'Recycled', // Or ERROR/TERMINATED
         metadata: { error: msg } 
    }).eq('user_id', userId);

    throw error;
  }
};
