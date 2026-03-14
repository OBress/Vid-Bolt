import { InstancesClient, FirewallsClient } from '@google-cloud/compute';
import { getGCPAuthClient } from './auth';

// CONSTANTS
const ZONE = 'us-east4-c';
const INSTANCE_NAME = 'vidbolt-workflow';
const FIREWALL_RULE_NAME = 'vidbolt-allow-8000';

/**
 * Ensure the firewall rule exists for port 8000
 */
export async function ensureFirewallRule(accessToken: string, projectId: string): Promise<{ created: boolean; existed: boolean }> {
    const authClient = await getGCPAuthClient(accessToken);
    const firewallsClient = new FirewallsClient({ authClient });
    
    try {
        // Check if rule already exists
        await firewallsClient.get({
            project: projectId,
            firewall: FIREWALL_RULE_NAME
        });
        return { created: false, existed: true };
    } catch (error: any) {
        // If 404, rule doesn't exist - create it
        if (error.code === 404 || error.code === 5) {
            console.log(`[GCP] Firewall rule '${FIREWALL_RULE_NAME}' not found. Creating...`);
            
            const [operation] = await firewallsClient.insert({
                project: projectId,
                firewallResource: {
                    name: FIREWALL_RULE_NAME,
                    description: 'Allow inbound traffic on port 8000 for VidBolt API',
                    network: `projects/${projectId}/global/networks/default`,
                    direction: 'INGRESS',
                    priority: 1000,
                    sourceRanges: ['0.0.0.0/0'],
                    allowed: [
                        { IPProtocol: 'tcp', ports: ['8000'] },
                        { IPProtocol: 'udp', ports: ['8000'] }
                    ],
                    targetTags: ['port8000']
                }
            });
            
            // Wait for operation to complete
            if (operation && typeof operation.promise === 'function') {
                await operation.promise();
            }
            
            return { created: true, existed: false };
        }
        throw error;
    }
}

/**
 * Ensure the IAP SSH firewall rule exists for browser-based SSH
 */
export async function ensureIAPSSHRule(accessToken: string, projectId: string): Promise<{ created: boolean; existed: boolean }> {
    const authClient = await getGCPAuthClient(accessToken);
    const firewallsClient = new FirewallsClient({ authClient });
    const ruleName = 'vidbolt-allow-iap-ssh';
    
    try {
        await firewallsClient.get({
            project: projectId,
            firewall: ruleName
        });
        return { created: false, existed: true };
    } catch (error: any) {
        if (error.code === 404 || error.code === 5) {
            console.log(`[GCP] IAP SSH firewall rule not found. Creating...`);
            
            const [operation] = await firewallsClient.insert({
                project: projectId,
                firewallResource: {
                    name: ruleName,
                    description: 'Allow SSH access via Cloud Identity-Aware Proxy',
                    network: `projects/${projectId}/global/networks/default`,
                    direction: 'INGRESS',
                    priority: 1000,
                    sourceRanges: ['35.235.240.0/20'], // IAP IP range
                    allowed: [
                        { IPProtocol: 'tcp', ports: ['22'] }
                    ],
                    targetTags: ['port8000'] // Same tag as our VM
                }
            });
            
            if (operation && typeof operation.promise === 'function') {
                await operation.promise();
            }
            
            return { created: true, existed: false };
        }
        throw error;
    }
}

export async function provisionNode(accessToken: string, userId: string, webhookUrl: string, projectId: string) {
  const authClient = await getGCPAuthClient(accessToken);
  const instancesClient = new InstancesClient({ authClient });

  // First, check if the VM already exists
  try {
    const [instance] = await instancesClient.get({
      project: projectId,
      zone: ZONE,
      instance: INSTANCE_NAME
    });

    const status = instance.status;
    console.log(`[GCP] VM '${INSTANCE_NAME}' already exists with status: ${status}`);

    // If VM exists and is stopped/terminated, start it
    if (status === 'TERMINATED' || status === 'STOPPED') {
      console.log(`[GCP] Starting existing VM...`);
      const [startOp] = await instancesClient.start({
        project: projectId,
        zone: ZONE,
        instance: INSTANCE_NAME
      });
      return startOp;
    }

    // If VM is already running or staging, return null (nothing to do)
    if (status === 'RUNNING' || status === 'STAGING' || status === 'PROVISIONING') {
      console.log(`[GCP] VM is already ${status}, no action needed.`);
      return null;
    }

    // For other states (SUSPENDING, SUSPENDED, etc.), try to start
    console.log(`[GCP] VM in state ${status}, attempting to start...`);
    const [startOp] = await instancesClient.start({
      project: projectId,
      zone: ZONE,
      instance: INSTANCE_NAME
    });
    return startOp;

  } catch (error: any) {
    // If 404 (NOT_FOUND), VM doesn't exist - proceed to create it
    if (error.code !== 404 && error.code !== 5) {
      throw error; // Re-throw unexpected errors
    }
    console.log(`[GCP] VM '${INSTANCE_NAME}' not found. Creating new instance...`);
  }

  // Configuration from VMandRuleDetails.md
  const MACHINE_TYPE = `projects/${projectId}/zones/${ZONE}/machineTypes/g4-standard-48`;
  const ACCELERATOR_TYPE = `projects/${projectId}/zones/${ZONE}/acceleratorTypes/nvidia-rtx-pro-6000`;
  const IMAGE_FAMILY = 'projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20260114';
  const DISK_TYPE = `projects/${projectId}/zones/${ZONE}/diskTypes/hyperdisk-balanced`;

  // The startup script - using proper escaping for bash
  const startupScript = `#!/bin/bash
set -e

# ==============================================================================
# CONFIGURATION & METADATA
# ==============================================================================
METADATA_URL="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
HEADER="Metadata-Flavor: Google"

get_metadata() {
    curl -f -H "$HEADER" "$METADATA_URL/$1" 2>/dev/null || echo ""
}

USER_ID=$(get_metadata "vidbolt-user-id")
WEBHOOK_URL=$(get_metadata "vidbolt-webhook-url")
INTERNAL_SECRET=$(get_metadata "vidbolt-internal-secret")
GITHUB_TOKEN=$(get_metadata "vidbolt-github-token")
REPO_URL=$(get_metadata "vidbolt-repo-url")
[ -z "$REPO_URL" ] && REPO_URL="https://github.com/OBress/Vid-Bolt-GPU-API.git"

# Get External IP for reporting
EXTERNAL_IP=$(curl -H "$HEADER" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/vidbolt-startup.log
}

report_status() {
    local status=$1
    local message=$2
    log "Reporting status: $status - $message"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST -H "Content-Type: application/json" -H "X-Internal-Secret: $INTERNAL_SECRET" \\
             -d "{\\"ip\\": \\"$EXTERNAL_IP\\", \\"user_id\\": \\"$USER_ID\\", \\"status\\": \\"$status\\", \\"message\\": \\"$message\\"}" \\
             "$WEBHOOK_URL" || log "Failed to report status"
    fi
}

# ==============================================================================
# PHASE 1: PHONE HOME (Booting)
# ==============================================================================
report_status "booting" "VM started, initializing..."

# ==============================================================================
# PHASE 2: DRIVER INSTALLATION (CHECKPOINT 1)
# ==============================================================================
FLAG_FILE="/var/lib/drivers_installed"

if [ ! -f "$FLAG_FILE" ]; then
    report_status "installing_drivers" "First boot: Installing NVIDIA drivers..."

    # Prevent interactive prompts
    export DEBIAN_FRONTEND=noninteractive

    # 1. Clean up old drivers and docker
    log "Cleaning up old drivers..."
    apt-get purge -y '*nvidia*' 'libnvidia*' 'docker.io' 'docker-doc' 'docker-compose' 'docker-compose-v2' 'podman-docker' 'containerd' 'runc' || true
    apt-get autoremove -y

    # 2. Install prerequisites
    report_status "installing_drivers" "Installing system prerequisites..."
    apt-get update && apt-get upgrade -y
    apt-get install -y build-essential dkms curl ca-certificates gnupg linux-headers-$(uname -r) git

    # 3. Nvidia Drivers (575-open)
    report_status "installing_drivers" "Downloading and installing NVIDIA 575 drivers..."
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
    dpkg -i cuda-keyring_1.1-1_all.deb
    apt-get update
    apt-get install -y nvidia-driver-575-open nvidia-dkms-575-open nvidia-utils-575

    # 4. Docker & Docker Compose
    report_status "installing_docker" "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # 5. NVIDIA Container Toolkit
    report_status "installing_docker" "Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
      tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit

    # 6. Configure Runtime
    log "Configuring Docker Runtime..."
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker

    # 7. Finalize
    usermod -aG docker ubuntu
    systemctl enable nvidia-persistenced
    systemctl start nvidia-persistenced

    # Create checkpoint flag
    touch "$FLAG_FILE"
    report_status "rebooting" "Driver installation complete. Rebooting..."

    reboot
    exit 0
else
    log "Drivers already installed (Checkpoint found). Skipping installation."
fi

# ==============================================================================
# PHASE 3: REPOSITORY SETUP WITH UPDATE DETECTION
# ==============================================================================
REPO_DIR="/home/ubuntu/Vid-Bolt-GPU-API"
NEEDS_REBUILD=false

if [ ! -d "$REPO_DIR" ]; then
    report_status "cloning_repo" "Cloning repository..."
    if [ -n "$GITHUB_TOKEN" ]; then
        # Inject token into URL for auth
        AUTH_REPO_URL=$(echo "$REPO_URL" | sed "s|https://|https://$GITHUB_TOKEN@|")
        git clone "$AUTH_REPO_URL" "$REPO_DIR"
    else
        git clone "$REPO_URL" "$REPO_DIR"
    fi
    chown -R ubuntu:ubuntu "$REPO_DIR"
    NEEDS_REBUILD=true
    log "Fresh clone completed. Will build from scratch."
else
    cd "$REPO_DIR"
    report_status "checking_updates" "Checking for repository updates..."

    # GCP startup runner doesn't set HOME; git --global needs it
    export HOME=/root

    # Allow git operations on this directory (since script runs as root but dir owned by ubuntu)
    git config --global --add safe.directory "$REPO_DIR"
    
    # Configure git for token auth if needed
    if [ -n "$GITHUB_TOKEN" ]; then
        AUTH_REPO_URL=$(echo "$REPO_URL" | sed "s|https://|https://$GITHUB_TOKEN@|")
        git remote set-url origin "$AUTH_REPO_URL"
    fi
    
    # Fetch latest from remote main branch
    git fetch origin main 2>/dev/null || git fetch origin 2>/dev/null
    
    # Compare local HEAD with remote HEAD
    LOCAL_HASH=$(git rev-parse HEAD)
    REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/HEAD 2>/dev/null)
    
    log "Local commit:  $LOCAL_HASH"
    log "Remote commit: $REMOTE_HASH"
    
    if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
        log "Updates detected! Pulling latest changes..."
        report_status "updating_repo" "Updates found. Pulling latest code..."
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/HEAD 2>/dev/null
        NEEDS_REBUILD=true
    else
        log "Repository is up-to-date. No code changes detected."
    fi
    
    chown -R ubuntu:ubuntu "$REPO_DIR"
fi

# ==============================================================================
# PHASE 4: LAUNCH APPLICATION (CONDITIONAL REBUILD)
# ==============================================================================
cd "$REPO_DIR"

# Ensure .env exists
if [ ! -f .env ]; then
    log "Creating default .env..."
    cp .env.example .env 2>/dev/null || log "No .env.example found, skipping..."
fi

if [ "$NEEDS_REBUILD" = true ]; then
    report_status "cleaning_docker" "Code changed. Cleaning old Docker resources..."
    log "Running docker system prune to clear old images/containers..."
    
    # Stop existing containers gracefully
    docker compose down --remove-orphans 2>/dev/null || true
    
    # Clean up Docker system (images, containers, volumes)
    docker system prune -af --volumes 2>/dev/null || true
    
    report_status "building_docker" "Building fresh Docker containers (10-20 min)..."
    docker compose build --no-cache
else
    log "No code changes. Checking if containers need starting..."
    
    # Check if containers are already running
    if docker compose ps 2>/dev/null | grep -q "Up"; then
        log "Containers already running. Restarting to ensure fresh state..."
        docker compose restart
    else
        report_status "building_docker" "Starting containers..."
        docker compose build
    fi
fi

report_status "starting_app" "Starting Docker containers..."
docker compose up -d

# ==============================================================================
# PHASE 5: FINAL SIGNAL
# ==============================================================================
# Wait for containers to be healthy
log "Waiting for containers to start..."
sleep 60

# Check if container is running
if docker compose ps | grep -q "Up"; then
    report_status "ready" "API service is running."
    log "Startup script completed successfully."
else
    report_status "error" "Docker containers failed to start. Check logs."
    log "ERROR: Docker containers not running!"
    docker compose logs >> /var/log/vidbolt-startup.log 2>&1
fi
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
          diskSizeGb: '350',
          diskType: DISK_TYPE,
          resourcePolicies: [] // Explicitly disable snapshot schedules/backups
        }
      }],
      networkInterfaces: [{
        name: 'global/networks/default',
         accessConfigs: [{
            name: 'External NAT',
            type: 'ONE_TO_ONE_NAT',
            networkTier: 'PREMIUM'
            }]
      }],
      metadata: {
        items: [
            { key: 'vidbolt-user-id', value: userId },
            { key: 'vidbolt-webhook-url', value: webhookUrl },
            { key: 'vidbolt-internal-secret', value: process.env.INTERNAL_API_SECRET || '' },
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
            status: instance.status,
            ip: externalIp
        };
    } catch (error: any) {
        if (error.code === 404) {
             return { status: "NOT_FOUND", ip: null };
        }
        throw error;
    }
}
