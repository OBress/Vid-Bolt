import { InstancesClient, ZoneOperationsClient } from '@google-cloud/compute';
import { getGCPAuthClient } from './auth';

// CONSTANTS
const ZONE = 'us-east4-c';
const INSTANCE_NAME = 'vidbolt-workflow';

export async function provisionNode(accessToken: string, userId: string, webhookUrl: string, projectId: string) {
  const authClient = await getGCPAuthClient(accessToken);
  const instancesClient = new InstancesClient({ authClient });

  // Configuration from VMandRuleDetails.md
  // Dynamic resource paths based on projectId
  const MACHINE_TYPE = `projects/${projectId}/zones/${ZONE}/machineTypes/g4-standard-48`;
  const ACCELERATOR_TYPE = `projects/${projectId}/zones/${ZONE}/acceleratorTypes/nvidia-rtx-pro-6000`;
  const IMAGE_FAMILY = 'projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20260114';
  const DISK_TYPE = `projects/${projectId}/zones/${ZONE}/diskTypes/hyperdisk-balanced`;

  const startupScript = `#!/bin/bash
# Startup Script Wrapper
export METADATA_URL="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
export HEADER="Metadata-Flavor: Google"

# Basic "Phone Home" to confirm boot
EXTERNAL_IP=$(curl -H "$HEADER" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
curl -X POST -H "Content-Type: application/json" -d "{\\"ip\\": \\"$EXTERNAL_IP\\", \\"user_id\\": \\"${userId}\\", \\"status\\": \\"booting\\"}" "${webhookUrl}"

# Execute the main logic (would be injected or downloaded here)
# For now, we simulate success
sleep 10
curl -X POST -H "Content-Type: application/json" -d "{\\"ip\\": \\"$EXTERNAL_IP\\", \\"user_id\\": \\"${userId}\\", \\"status\\": \\"ready\\"}" "${webhookUrl}"
`;

  const [response] = await instancesClient.insert({
    project: projectId,
    zone: ZONE,
    instanceResource: {
      name: INSTANCE_NAME,
      machineType: MACHINE_TYPE,
      guestAccelerators: [{
        acceleratorCount: 1,
        acceleratorType: ACCELERATOR_TYPE
      }],
      disks: [{
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: IMAGE_FAMILY,
          diskSizeGb: '300',
          diskType: DISK_TYPE
        }
      }],
      networkInterfaces: [{
        name: 'global/networks/default',
         accessConfigs: [{
            name: 'External NAT',
            type: 'ONE_TO_ONE_NAT',
            networkTier: 'PREMIUM'
            }] // Request Ephemeral IP
      }],
      metadata: {
        items: [
            { key: 'vidbolt-user-id', value: userId },
            { key: 'vidbolt-webhook-url', value: webhookUrl },
            { key: 'startup-script', value: startupScript },
            { key: 'enable-osconfig', value: 'TRUE' },
            { key: 'vidbolt-github-token', value: process.env.VIDBOLT_GITHUB_TOKEN || '' },
            { key: 'vidbolt-repo-url', value: process.env.VIDBOLT_REPO_URL || 'https://github.com/OBress/Vid-Bolt-GPU-API.git' }
        ]
      },
      tags: {
        items: ['port8000', 'http-server', 'https-server']
      },
      scheduling: {
          provisioningModel: 'SPOT',
          instanceTerminationAction: 'STOP',
          onHostMaintenance: 'TERMINATE',
          automaticRestart: false
      }
    }
  });

  return response;
}

export async function stopNode(accessToken: string, projectId: string) {
    const authClient = await getGCPAuthClient(accessToken);
    const instancesClient = new InstancesClient({ authClient });
    
    const [response] = await instancesClient.stop({
        project: projectId,
        zone: ZONE,
        instance: INSTANCE_NAME
    });
    return response;
}

export async function startNode(accessToken: string, projectId: string) {
    const authClient = await getGCPAuthClient(accessToken);
    const instancesClient = new InstancesClient({ authClient });

    const [response] = await instancesClient.start({
        project: projectId,
        zone: ZONE,
        instance: INSTANCE_NAME
    });
    return response;
}

export async function getNodeStatus(accessToken: string, projectId: string) {
    const authClient = await getGCPAuthClient(accessToken);
    const instancesClient = new InstancesClient({ authClient });

    try {
        const [instance] = await instancesClient.get({
            project: projectId,
            zone: ZONE,
            instance: INSTANCE_NAME
        });

        const externalIp = instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || null;
        
        return {
            status: instance.status, // PROVISIONING, STAGING, RUNNING, STOPPING, TERMINATED
            ip: externalIp
        };
    } catch (error: any) {
        if (error.code === 404) {
             return { status: "NOT_FOUND", ip: null };
        }
        throw error;
    }
}
