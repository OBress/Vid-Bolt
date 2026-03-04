# Deployment Guide — Vid-Bolt on Hetzner CX-43

End-to-end instructions to host Vid-Bolt (Vibbo) in production. Follow these steps in order.

> [!IMPORTANT]
> All infrastructure config files are already in the repo. This guide covers the **server-side setup** and **first deployment**.

---

## Table of Contents

1. [Provision the Server](#1-provision-the-server)
2. [Server First-Boot Setup](#2-server-first-boot-setup)
3. [DNS Configuration](#3-dns-configuration)
4. [Create Production Environment File](#4-create-production-environment-file)
5. [Configure GitHub Secrets](#5-configure-github-secrets)
6. [First Deployment](#6-first-deployment)
7. [Deploy Monitoring Stack](#7-deploy-monitoring-stack)
8. [External Service Adjustments](#8-external-service-adjustments)
9. [Verify Everything](#9-verify-everything)
10. [Ongoing Operations](#10-ongoing-operations)

---

## 1. Provision the Server

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Create a new project (e.g., "Vibbo Production")
3. Add a server:
   - **Type**: CX-43 (8 vCPUs, 16 GB RAM, 160 GB SSD)
   - **Image**: Ubuntu 24.04 LTS
   - **Location**: closest to your users (e.g., `fsn1` Falkenstein or `nbg1` Nuremberg)
   - **SSH Key**: add your public SSH key
   - **Firewall**: enable before first boot
4. Note down the **server IP address**

### Hetzner Firewall Rules

| Direction | Protocol | Port | Source    | Description |
| --------- | -------- | ---- | --------- | ----------- |
| Inbound   | TCP      | 22   | Your IP   | SSH         |
| Inbound   | TCP      | 80   | 0.0.0.0/0 | HTTP        |
| Inbound   | TCP      | 443  | 0.0.0.0/0 | HTTPS       |
| Outbound  | All      | All  | 0.0.0.0/0 | Allow all   |

---

## 2. Server First-Boot Setup

SSH into the server as root and run this setup script:

```bash
ssh root@YOUR_SERVER_IP
```

```bash
#!/bin/bash
# ============================================================================
# Vibbo Server First-Boot Setup
# ============================================================================

# Update system
apt update && apt upgrade -y

# Install Docker (official method)
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Install docker-rollout for zero-downtime deploys
curl -fsSL https://github.com/Wowu/docker-rollout/releases/latest/download/docker-rollout \
  -o /usr/local/lib/docker/cli-plugins/docker-rollout
chmod +x /usr/local/lib/docker/cli-plugins/docker-rollout

# Create non-root deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh

# Firewall (UFW)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (Traefik)
ufw allow 443/tcp  # HTTPS (Traefik)
ufw --force enable

# Swap (safety net for memory spikes)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Set timezone
timedatectl set-timezone UTC

# Automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Security hardening
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Fail2ban for brute-force protection
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

echo "✅ Server setup complete — log in as 'deploy' from now on"
```

### Set Up the Deployment Directory

Switch to the deploy user and set up the project:

```bash
# Log in as deploy user
ssh deploy@YOUR_SERVER_IP

# Create project directory
mkdir -p /home/deploy/vibbo

# Create the Docker web network (shared across compose files)
docker network create web

# Create internal network
docker network create internal

# Login to GitHub Container Registry
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u obress --password-stdin
```

> [!IMPORTANT]
> You need a **GitHub Personal Access Token (PAT)** with `read:packages` scope to pull images from GHCR. Create one at [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens).

### Copy Config Files to Server

From your local machine, copy the infrastructure configs:

```bash
# From the Vid-Bolt project root
scp docker-compose.prod.yml deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp docker-compose.monitoring.yml deploy@YOUR_SERVER_IP:/home/deploy/vibbo/

scp -r redis/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp -r traefik/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp -r prometheus/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp -r loki/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp -r promtail/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
scp -r grafana/ deploy@YOUR_SERVER_IP:/home/deploy/vibbo/
```

### Prepare SSL Certificates File

```bash
ssh deploy@YOUR_SERVER_IP
touch /home/deploy/vibbo/traefik/acme.json
chmod 600 /home/deploy/vibbo/traefik/acme.json
```

---

## 3. DNS Configuration

In your **Cloudflare** dashboard (or DNS provider):

| Type | Name    | Content        | Proxy                 |
| ---- | ------- | -------------- | --------------------- |
| A    | `app`   | YOUR_SERVER_IP | DNS only (grey cloud) |
| A    | `admin` | YOUR_SERVER_IP | DNS only (grey cloud) |

> [!WARNING]
> **Set Cloudflare proxy to DNS-only (grey cloud)** for both records. This lets Traefik handle SSL directly via Let's Encrypt. If you enable Cloudflare's proxy (orange cloud), Traefik's HTTP challenge will fail.

### Cloudflare SSL Settings (if using Cloudflare)

- **SSL/TLS mode**: Full (Strict)
- **Always Use HTTPS**: On
- **Minimum TLS Version**: 1.2

---

## 4. Create Production Environment File

On the server, create the `.env.production` file:

```bash
ssh deploy@YOUR_SERVER_IP
nano /home/deploy/vibbo/.env.production
```

```bash
# =============================================================================
# Vibbo Production Environment Variables
# =============================================================================

# ---- Next.js ----
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
HOSTNAME=0.0.0.0
PORT=3000

# ---- Supabase (Cloud) ----
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ---- Redis (local on Hetzner) ----
REDIS_URL=redis://redis:6379
# Upstash Redis for rate limiting (keep for geo-distributed edge)
UPSTASH_REDIS_REST_URL=https://YOUR_UPSTASH.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN

# ---- Cloudflare R2 ----
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_WORKER_API_TOKEN=your_token
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET_NAME=vibbo-assets
R2_PUBLIC_URL=https://assets.vidbolt.app

# ---- AWS (Remotion Lambda) ----
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
REMOTION_AWS_REGION=us-east-1
REMOTION_SERVE_URL=https://your-remotion-bundle.s3.amazonaws.com

# ---- API Keys ----
OPENROUTER_API_KEY=sk-or-...
PEXELS_API_KEY=your_key
SERPER_API_KEY=your_key
VALYU_API_KEY=your_key
INWORLD_API_KEY=your_key

# ---- Stripe ----
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ---- GCP (GPU provisioning) ----
GCP_PROJECT_ID=your_project
GCP_CREDENTIALS_JSON={"type":"service_account",...}

# ---- Application ----
NEXT_PUBLIC_APP_URL=https://app.vidbolt.app
RENDER_CONCURRENCY_LIMIT=4
DATA_RETENTION_DAYS=20

# ---- Monitoring ----
GRAFANA_PASSWORD=your_secure_grafana_password

# ---- Admin Auth (for admin.vidbolt.app) ----
# Generate with: htpasswd -nb admin YOUR_PASSWORD
# Escape $ with $$ for Docker
ADMIN_BASIC_AUTH=admin:$$apr1$$GENERATED_HASH
```

> [!CAUTION]
> **Never commit this file to Git.** It's in `.gitignore`. Store a backup in a password manager.

---

## 5. Configure GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** and add:

| Secret                          | Value                                     |
| ------------------------------- | ----------------------------------------- |
| `HETZNER_HOST`                  | Your Hetzner server IP address            |
| `HETZNER_SSH_KEY`               | The **private** SSH key for `deploy` user |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key                    |

> [!TIP]
> For `HETZNER_SSH_KEY`, generate a dedicated key pair: `ssh-keygen -t ed25519 -f ~/.ssh/hetzner_deploy -C "github-actions"`. Add the public key to `/home/deploy/.ssh/authorized_keys` on the server and paste the private key as the GitHub secret.

---

## 6. First Deployment

### Option A: Automatic (via GitHub Actions)

Push any change to `main` that touches `web/`:

```bash
git add .
git commit -m "feat: add CI/CD deployment infrastructure"
git push origin main
```

Monitor the deployment at: **GitHub → Actions → Deploy Vibbo**

### Option B: Manual (first time, to verify)

From the server:

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/vibbo

# Pull the image (after the GitHub Action builds it)
docker pull ghcr.io/obress/vibbo-web:latest

# Start the production stack
docker compose -f docker-compose.prod.yml up -d

# Check logs
docker compose -f docker-compose.prod.yml logs -f app
```

### Verify

```bash
# From your local machine
curl -s https://app.vidbolt.app/api/health | python -m json.tool
# Expected: { "status": "healthy", "redis": "connected", ... }
```

---

## 7. Deploy Monitoring Stack

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/vibbo

# Start the monitoring stack
docker compose -f docker-compose.monitoring.yml up -d

# Verify Grafana is accessible
curl -s -o /dev/null -w "%{http_code}" https://admin.vidbolt.app/grafana/login
# Expected: 401 (Basic Auth challenge) or 200
```

### Import Grafana Dashboards

1. Open `https://admin.vidbolt.app/grafana/` (Basic Auth: admin / your password)
2. Log into Grafana (admin / your `GRAFANA_PASSWORD`)
3. Go to **Dashboards** → **Import**
4. Import these by ID:

| Dashboard          | Grafana ID | Purpose                  |
| ------------------ | ---------- | ------------------------ |
| Node Exporter Full | `1860`     | Server hardware metrics  |
| Docker + cAdvisor  | `14282`    | Container resource usage |
| Traefik            | `17346`    | Reverse proxy metrics    |

5. Use the **Explore** tab with the Loki data source to search container logs

---

## 8. External Service Adjustments

### Supabase

- [ ] Update auth callback URLs: `https://app.vidbolt.app/auth/callback`
- [ ] Enable MFA on your Supabase dashboard account
- [ ] Verify RLS is enabled on all tables

### Stripe

- [ ] Switch to **live API keys** (Dashboard → Developers → API keys)
- [ ] Create production webhook endpoint: `https://app.vidbolt.app/api/webhooks/stripe`
- [ ] Update `STRIPE_WEBHOOK_SECRET` in `.env.production`
- [ ] Test a real payment flow

### Cloudflare R2

- [ ] Set up custom domain `assets.vidbolt.app` → R2 bucket
- [ ] Enable WAF rules for basic bot protection

### AWS (Remotion Lambda)

- [ ] Ensure Hetzner server IP is not blocked by AWS security groups
- [ ] Verify S3 bucket CORS allows `https://app.vidbolt.app`

---

## 9. Verify Everything

Run through this checklist:

- [ ] `https://app.vidbolt.app` — loads the application
- [ ] `https://app.vidbolt.app/api/health` — returns `{"status": "healthy"}`
- [ ] `https://admin.vidbolt.app/queues/` — shows Bull Board (after Basic Auth)
- [ ] `https://admin.vidbolt.app/grafana/` — shows Grafana login (after Basic Auth)
- [ ] Create a test video project — verify the full pipeline works
- [ ] Check Grafana dashboards are receiving metrics
- [ ] Check Loki logs are being collected (`Explore` → Loki → `{service="vibbo-app"}`)

---

## 10. Ongoing Operations

### Deploy New Changes

Just push to `main`. The GitHub Actions workflow handles everything automatically:
build → push to GHCR → SSH deploy → zero-downtime rollout → health check → auto-rollback on failure.

### Manual Rollback

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/vibbo

# List available image tags
docker images ghcr.io/obress/vibbo-web --format "table {{.Tag}}\t{{.CreatedAt}}"

# Roll back to previous SHA
docker pull ghcr.io/obress/vibbo-web:PREVIOUS_SHA
docker compose -f docker-compose.prod.yml up -d app workers
```

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f workers
```

### Redis Backup (set up as cron)

```bash
# Create backup script
mkdir -p /home/deploy/scripts
cat > /home/deploy/scripts/backup-redis.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec vibbo-redis redis-cli BGSAVE
sleep 5
docker cp vibbo-redis:/data/dump.rdb /tmp/redis-backup-${TIMESTAMP}.rdb
gzip /tmp/redis-backup-${TIMESTAMP}.rdb
# Keep only last 7 days of local backups
find /tmp -name "redis-backup-*.rdb.gz" -mtime +7 -delete
echo "✅ Redis backup complete: redis-backup-${TIMESTAMP}.rdb.gz"
EOF
chmod +x /home/deploy/scripts/backup-redis.sh

# Add to crontab (daily at 3 AM UTC)
(crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/scripts/backup-redis.sh") | crontab -
```

### Disaster Recovery

1. Provision new CX-43 server
2. Run the first-boot setup script (Section 2)
3. Copy config files from Git repo to server
4. Place `.env.production` from password manager
5. Pull Docker images: `docker compose -f docker-compose.prod.yml pull`
6. Restore Redis backup if needed
7. Start stack: `docker compose -f docker-compose.prod.yml up -d`
8. Update DNS A records to new server IP
9. SSL certificates auto-issue via Traefik + Let's Encrypt

**Recovery Time Objective (RTO)**: ~15 minutes.
