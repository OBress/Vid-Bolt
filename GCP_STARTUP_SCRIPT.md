# GCP Automated Startup Script

This script allows for the automatic provisioning of the Vid-Bolt GPU Node. It handles the driver installation, reboot cycle, and application startup safely.

## Usage

Inject this script into the `startup-script` metadata key when creating the VM instance.

### Required Metadata Keys

- `vidbolt-user-id`: The ID of the user owning this node.
- `vidbolt-webhook-url`: The endpoint to report status back to.
- `vidbolt-github-token`: (Optional) Personal Access Token for cloning private repos.
- `vidbolt-repo-url`: URL of the git repository (default: https://github.com/OBress/Vid-Bolt-GPU-API.git)

## The Script

```bash
#!/bin/bash
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
    log "Reporting status: $status"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST -H "Content-Type: application/json" \
             -d "{\"ip\": \"$EXTERNAL_IP\", \"user_id\": \"$USER_ID\", \"status\": \"$status\"}" \
             "$WEBHOOK_URL" || log "Failed to report status"
    fi
}

# ==============================================================================
# PHASE 1: PHONE HOME (Booting)
# ==============================================================================
report_status "booting"

# ==============================================================================
# PHASE 2: DRIVER INSTALLATION (CHECKPOINT 1)
# ==============================================================================
FLAG_FILE="/var/lib/drivers_installed"

if [ ! -f "$FLAG_FILE" ]; then
    log "First boot detected. Starting Driver Installation..."

    # Prevent interactive prompts
    export DEBIAN_FRONTEND=noninteractive

    # 1. Clean up old drivers and docker
    log "Cleaning up old drivers..."
    apt-get purge -y '*nvidia*' 'libnvidia*' 'docker.io' 'docker-doc' 'docker-compose' 'docker-compose-v2' 'podman-docker' 'containerd' 'runc'
    apt-get autoremove -y

    # 2. Install prerequisites
    log "Installing prerequisites..."
    apt-get update && apt-get upgrade -y
    apt-get install -y build-essential dkms curl ca-certificates gnupg linux-headers-$(uname -r) git

    # 3. Nvidia Drivers (575-open)
    log "Installing NVIDIA Drivers..."
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
    dpkg -i cuda-keyring_1.1-1_all.deb
    apt-get update
    apt-get install -y nvidia-driver-575-open nvidia-dkms-575-open nvidia-utils-575

    # 4. Docker & Docker Compose
    log "Installing Docker..."
    install -m 0.755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # 5. NVIDIA Container Toolkit
    log "Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
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
    log "Driver installation complete. Rebooting..."

    reboot
    exit 0
else
    log "Drivers already installed (Checkpoint found). Skipping installation."
fi

# ==============================================================================
# PHASE 3: REPOSITORY SETUP (CHECKPOINT 2)
# ==============================================================================
REPO_DIR="/home/ubuntu/Vid-Bolt-GPU-API"

if [ ! -d "$REPO_DIR" ]; then
    log "Cloning repository..."
    if [ -n "$GITHUB_TOKEN" ]; then
        # Inject token into URL for auth
        AUTH_REPO_URL=$(echo "$REPO_URL" | sed "s/https:\/\//https:\/\/$GITHUB_TOKEN@/")
        git clone "$AUTH_REPO_URL" "$REPO_DIR"
    else
        git clone "$REPO_URL" "$REPO_DIR"
    fi

    # Fix permissions for ubuntu user
    chown -R ubuntu:ubuntu "$REPO_DIR"
else
    log "Repository exists. Pulling latest changes..."
    cd "$REPO_DIR"
    git pull
    chown -R ubuntu:ubuntu "$REPO_DIR" # Ensure permissions
fi

# ==============================================================================
# PHASE 4: LAUNCH APPLICATION
# ==============================================================================
cd "$REPO_DIR"

# Ensure .env exists
if [ ! -f .env ]; then
    log "Creating default .env..."
    cp .env.example .env
fi

log "Starting Docker containers..."
docker compose up -d --build

# ==============================================================================
# PHASE 5: FINAL SIGNAL
# ==============================================================================
# Wait a brief moment for containers to spin up
sleep 30
report_status "ready"

log "Startup script completed successfully."
```
