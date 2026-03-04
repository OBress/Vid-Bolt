# CI/CD Deployment Architecture — Vibbo on Hetzner CX-43

> **Created**: March 2026  
> **Target Server**: Hetzner CX-43 (8 vCPUs, 16 GB RAM, 160 GB SSD, ~£10/mo)  
> **Scope**: Next.js web app + BullMQ workers + Redis (GPU API deployed separately)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Hetzner CX-43 Resource Budget](#2-hetzner-cx-43-resource-budget)
3. [Server Initial Setup](#3-server-initial-setup)
4. [Docker Compose Production Stack](#4-docker-compose-production-stack)
5. [Optimised Production Dockerfile](#5-optimised-production-dockerfile)
6. [Reverse Proxy & SSL — Traefik v3](#6-reverse-proxy--ssl--traefik-v3)
7. [Zero-Downtime Deployments](#7-zero-downtime-deployments)
8. [CI/CD Pipeline — GitHub Actions](#8-cicd-pipeline--github-actions)
9. [Monitoring, Logging & Alerting — PLG Stack](#9-monitoring-logging--alerting--plg-stack)
10. [BullMQ Dashboard](#10-bullmq-dashboard)
11. [Environment Variables — Production Checklist](#11-environment-variables--production-checklist)
12. [External Service Production Adjustments](#12-external-service-production-adjustments)
13. [Security Hardening](#13-security-hardening)
14. [Per-User Error Tracking & GPU API Observability](#14-per-user-error-tracking--gpu-api-observability)
15. [Backup & Disaster Recovery](#15-backup--disaster-recovery)
16. [Rollback Strategy](#16-rollback-strategy)
17. [Cost Summary](#17-cost-summary)
18. [Implementation Checklist](#18-implementation-checklist)

---

## 1. Architecture Overview

```
┌────────────────────────────────────── Hetzner CX-43 ──────────────────────────────────────┐
│                                                                                            │
│  ┌──────────┐     ┌─────────────────────┐     ┌──────────────────┐                        │
│  │ Traefik  │────►│  Next.js App        │     │  BullMQ Workers  │                        │
│  │  (v3)    │     │  (standalone mode)  │────►│  (29 queues)     │                        │
│  │  :80/443 │     │  :3000              │     │                  │                        │
│  └────┬─────┘     └─────────┬───────────┘     └────────┬─────────┘                        │
│       │                     │                          │                                   │
│       │              ┌──────┴──────┐            ┌──────┴──────┐                            │
│       │              │  Redis 7    │◄───────────┤  Redis      │                            │
│       │              │  (Alpine)   │            │  (shared)   │                            │
│       │              │  :6379      │            │             │                            │
│       │              └─────────────┘            └─────────────┘                            │
│       │                                                                                    │
│  ┌────┴──────────────────────────────────────────────────────────────┐                     │
│  │                    Observability Stack                             │                     │
│  │  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐  │                     │
│  │  │ Grafana   │  │Prometheus│  │  Loki   │  │   Promtail      │  │                     │
│  │  │ :3001     │  │  :9090   │  │  :3100  │  │ (log collector) │  │                     │
│  │  └───────────┘  └──────────┘  └─────────┘  └──────────────────┘  │                     │
│  │  ┌──────────────┐  ┌──────────────┐                               │                     │
│  │  │ Node Exporter│  │  cAdvisor    │                               │                     │
│  │  │  :9100       │  │  :8080       │                               │                     │
│  │  └──────────────┘  └──────────────┘                               │                     │
│  └───────────────────────────────────────────────────────────────────┘                     │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
         │                             ▲
         │ HTTPS (Cloudflare DNS)      │
         ▼                             │
    ┌─────────┐                  ┌─────┴──────┐
    │  Users   │                 │  GitHub    │
    │          │                 │  Actions   │
    └─────────┘                 │  (CI/CD)   │
                                └────────────┘

External Services (unchanged):
  • Supabase Cloud (PostgreSQL + Auth)
  • Cloudflare R2 (Object Storage)
  • Upstash Redis (Rate Limiting / Cache)
  • AWS Lambda (Remotion Rendering)
  • GPU API (Deployed separately on GPU hardware)
```

### What Runs on Hetzner

| Service                      | Purpose                     | Resource Weight |
| ---------------------------- | --------------------------- | --------------- |
| **Next.js App**              | SSR frontend + API routes   | ~400 MB RAM     |
| **BullMQ Workers**           | 29 queues for AI pipelines  | ~500 MB RAM     |
| **Redis 7**                  | Local job queue backend     | ~200 MB RAM     |
| **Traefik v3**               | Reverse proxy, SSL, routing | ~50 MB RAM      |
| **Grafana**                  | Dashboards & alerts         | ~200 MB RAM     |
| **Prometheus**               | Metrics collection          | ~300 MB RAM     |
| **Loki + Promtail**          | Log aggregation             | ~300 MB RAM     |
| **Node Exporter + cAdvisor** | Host & container metrics    | ~100 MB RAM     |
| **Bull Board**               | BullMQ queue dashboard      | ~100 MB RAM     |

**Total estimated**: ~2.2 GB RAM baseline → leaves ~13.8 GB headroom for traffic spikes and worker bursts.

---

## 2. Hetzner CX-43 Resource Budget

| Resource         | Available  | Reserved for OS/Docker | Available for Stack |
| ---------------- | ---------- | ---------------------- | ------------------- |
| **vCPUs**        | 8 (shared) | ~0.5                   | ~7.5                |
| **RAM**          | 16 GB      | ~1 GB                  | ~15 GB              |
| **SSD**          | 160 GB     | ~5 GB (OS + Docker)    | ~155 GB             |
| **Bandwidth**    | 20 TB/mo   | —                      | 20 TB/mo            |
| **Monthly Cost** | ~£10       | —                      | —                   |

### Resource Allocation Plan

| Component                | CPU Limit | Memory Limit | Memory Reserve |
| ------------------------ | --------- | ------------ | -------------- |
| Next.js App              | 2 CPUs    | 2 GB         | 512 MB         |
| BullMQ Workers           | 3 CPUs    | 4 GB         | 1 GB           |
| Redis                    | 1 CPU     | 1 GB         | 256 MB         |
| Traefik                  | 0.5 CPU   | 256 MB       | 64 MB          |
| Grafana                  | 0.5 CPU   | 512 MB       | 128 MB         |
| Prometheus               | 0.5 CPU   | 512 MB       | 128 MB         |
| Loki + Promtail          | 0.5 CPU   | 512 MB       | 128 MB         |
| Bull Board               | 0.25 CPU  | 256 MB       | 64 MB          |
| Node Exporter + cAdvisor | 0.25 CPU  | 256 MB       | 64 MB          |

---

## 3. Server Initial Setup

### 3.1 Provision the Server

1. Create CX-43 in Hetzner Cloud Console
2. Select **Ubuntu 24.04 LTS** image
3. Add your SSH key
4. Select closest data centre (e.g., `fsn1` — Falkenstein, or `nbg1` — Nuremberg)
5. Enable **Hetzner Firewall** before first boot

### 3.2 First Boot Script

```bash
#!/bin/bash
# Run as root on first SSH connection

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

# Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "✅ Server setup complete"
```

### 3.3 Directory Structure

```
/home/deploy/vibbo/
├── docker-compose.prod.yml       # Main production compose
├── docker-compose.monitoring.yml # Observability stack
├── .env.production               # Production environment vars
├── traefik/
│   ├── traefik.yml               # Static Traefik config
│   ├── dynamic/                  # Dynamic route configs
│   └── acme.json                 # Let's Encrypt certificates
├── prometheus/
│   └── prometheus.yml            # Scrape targets
├── loki/
│   └── loki-config.yml           # Loki config
├── promtail/
│   └── promtail-config.yml       # Log collection config
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml   # Auto-provision Prometheus + Loki
│       └── dashboards/
│           └── dashboards.yml    # Pre-built dashboard configs
└── redis/
    └── redis.conf                # Production Redis config
```

---

## 4. Docker Compose Production Stack

### `docker-compose.prod.yml`

```yaml
# =============================================================================
# Vibbo Production Stack — Hetzner CX-43
# =============================================================================
# Usage:
#   docker compose -f docker-compose.prod.yml up -d
#   docker rollout -f docker-compose.prod.yml app    (zero-downtime deploy)
#   docker rollout -f docker-compose.prod.yml workers (zero-downtime deploy)
# =============================================================================

services:
  # ---------------------------------------------------------------------------
  # Traefik v3 — Reverse Proxy + Auto-SSL
  # ---------------------------------------------------------------------------
  traefik:
    image: traefik:v3.3
    container_name: vibbo-traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/dynamic:/etc/traefik/dynamic:ro
      - ./traefik/acme.json:/acme.json
    networks:
      - web
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M

  # ---------------------------------------------------------------------------
  # Redis 7 — Job Queue Backend
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: vibbo-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
    command: redis-server /usr/local/etc/redis/redis.conf
    networks:
      - internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 1G

  # ---------------------------------------------------------------------------
  # Next.js App — Web Frontend + API
  # ---------------------------------------------------------------------------
  app:
    image: ghcr.io/YOUR_GITHUB_USER/vibbo-web:latest
    # Or: build from local context during initial setup
    # build:
    #   context: ./web
    #   dockerfile: Dockerfile.prod
    container_name: vibbo-app
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - HOSTNAME=0.0.0.0
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - web
      - internal
    healthcheck:
      test:
        ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app.rule=Host(`app.vidbolt.app`)"
      - "traefik.http.routers.app.entrypoints=websecure"
      - "traefik.http.routers.app.tls.certresolver=letsencrypt"
      - "traefik.http.services.app.loadbalancer.server.port=3000"
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G

  # ---------------------------------------------------------------------------
  # BullMQ Workers — Background Job Processing
  # ---------------------------------------------------------------------------
  workers:
    image: ghcr.io/YOUR_GITHUB_USER/vibbo-web:latest
    container_name: vibbo-workers
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    command: ["npm", "run", "workers:start"]
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - internal
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('net').connect(6379, 'redis').on('connect', () => process.exit(0)).on('error', () => process.exit(1))",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: "3"
          memory: 4G

  # ---------------------------------------------------------------------------
  # Bull Board — Queue Dashboard
  # ---------------------------------------------------------------------------
  bull-board:
    image: deadly0/bull-board:latest
    container_name: vibbo-bull-board
    restart: unless-stopped
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_USE_TLS=false
      - BULL_PREFIX=bull
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - web
      - internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bullboard.rule=Host(`queues.vidbolt.app`)"
      - "traefik.http.routers.bullboard.entrypoints=websecure"
      - "traefik.http.routers.bullboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.bullboard.middlewares=auth-bullboard"
      - "traefik.http.middlewares.auth-bullboard.basicauth.users=admin:$$apr1$$HASHED_PASSWORD"
      - "traefik.http.services.bullboard.loadbalancer.server.port=3000"
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 256M

networks:
  web:
    external: true
  internal:
    driver: bridge

volumes:
  redis_data:
```

> [!IMPORTANT]
> Replace `YOUR_GITHUB_USER`, `app.vidbolt.app`, and `queues.vidbolt.app` with your actual GitHub Container Registry path and domain names. Generate the basic auth password hash with `htpasswd -nb admin YOUR_PASSWORD`.

---

## 5. Optimised Production Dockerfile

Replace the existing `web/Dockerfile` with a multi-stage build using Next.js standalone output.

### `web/Dockerfile.prod`

```dockerfile
# =============================================================================
# Vibbo Production Dockerfile — Multi-Stage Standalone Build
# =============================================================================
# Produces a ~200MB image (vs ~1.5GB with current single-stage)
# =============================================================================

# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app

# Install system deps needed for native modules
RUN apk add --no-cache libc6-compat python3 make g++

COPY package*.json ./
RUN npm ci --legacy-peer-deps --production=false

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 3: Production Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime system dependencies (yt-dlp + ffmpeg)
RUN apk add --no-cache python3 py3-pip ffmpeg \
    && pip3 install yt-dlp --break-system-packages

# Verify installations
RUN yt-dlp --version && ffmpeg -version

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy worker files (needed for npm run workers:start)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default: run the Next.js server (overridden for workers)
CMD ["node", "server.js"]
```

> [!IMPORTANT]
> You must add `output: 'standalone'` to your `next.config.ts` for this to work:
>
> ```typescript
> const nextConfig: NextConfig = {
>   output: "standalone",
>   // ... existing config
> };
> ```

---

## 6. Reverse Proxy & SSL — Traefik v3

### `traefik/traefik.yml`

```yaml
# Traefik v3 static configuration
api:
  dashboard: true
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: web
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@vidbolt.app # CHANGE THIS
      storage: /acme.json
      httpChallenge:
        entryPoint: web

log:
  level: WARN

accessLog:
  filePath: /var/log/traefik/access.log
  filters:
    statusCodes:
      - "400-599"

metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addServicesLabels: true
```

### `traefik/dynamic/middlewares.yml`

```yaml
http:
  middlewares:
    # Rate limiting
    rate-limit:
      rateLimit:
        average: 100
        burst: 200
        period: 1s

    # Security headers
    security-headers:
      headers:
        browserXssFilter: true
        contentTypeNosniff: true
        frameDeny: true
        stsIncludeSubdomains: true
        stsPreload: true
        stsSeconds: 31536000
        customFrameOptionsValue: "SAMEORIGIN"

    # Compress responses
    compress:
      compress:
        excludedContentTypes:
          - "text/event-stream"
```

### Prepare Certificates File

```bash
# On the server, run once:
touch /home/deploy/vibbo/traefik/acme.json
chmod 600 /home/deploy/vibbo/traefik/acme.json

# Create the web network (shared across compose files)
docker network create web
```

---

## 7. Zero-Downtime Deployments

### Strategy: `docker-rollout` Plugin

`docker-rollout` is a Docker CLI plugin that performs rolling updates for Docker Compose. It:

1. Scales the service to 2× instances (old + new)
2. Waits for the new container to pass health checks
3. Removes the old container
4. Traefik automatically routes traffic to the healthy container

### Deployment Command

```bash
# Deploy the Next.js app with zero downtime
docker rollout -f docker-compose.prod.yml app

# Deploy workers with zero downtime
docker rollout -f docker-compose.prod.yml workers
```

### How It Works with Traefik

```
Time T0: [Old App Container] ◄── Traefik routes here
Time T1: [Old App Container] + [New App Container starting...]
Time T2: [Old App Container] + [New App Container ✓ healthy]  ◄── Traefik now routes here
Time T3: [New App Container ✓]  (old removed)
```

### Graceful Worker Shutdown

Your `worker-bootstrap.ts` already handles `SIGTERM` gracefully — it finishes in-progress jobs before exiting. `docker-rollout` sends `SIGTERM` first, then waits for the container's `stop_grace_period` (default 30s) before force-killing.

> [!TIP]
> Add `stop_grace_period: 120s` to the workers service in your compose file if long-running jobs need more time to finish.

---

## 8. CI/CD Pipeline — GitHub Actions

### `.github/workflows/deploy.yml`

```yaml
name: Deploy Vibbo

on:
  push:
    branches: [main]
    paths:
      - "web/**"
      - "docker-compose.prod.yml"
      - ".github/workflows/deploy.yml"

concurrency:
  group: deploy-production
  cancel-in-progress: false # Don't cancel in-progress deploys

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository_owner }}/vibbo-web

jobs:
  # ─────────────────────────────────────────────
  # Build & Push Docker Image
  # ─────────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./web
          file: ./web/Dockerfile.prod
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

  # ─────────────────────────────────────────────
  # Deploy to Hetzner
  # ─────────────────────────────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: build

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: deploy
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /home/deploy/vibbo

            # Pull latest image
            docker pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

            # Zero-downtime rollout for app
            docker rollout -f docker-compose.prod.yml app

            # Zero-downtime rollout for workers
            docker rollout -f docker-compose.prod.yml workers

            # Clean up old images (keep last 3)
            docker image prune -a --filter "until=72h" -f

            echo "✅ Deployment complete at $(date)"

      - name: Verify deployment
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: deploy
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            # Wait for health check
            sleep 15

            # Check app is responding
            HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.vidbolt.app/api/health)
            if [ "$HTTP_STATUS" != "200" ]; then
              echo "❌ Health check failed (HTTP $HTTP_STATUS)"
              exit 1
            fi

            echo "✅ Health check passed"

      - name: Notify on failure
        if: failure()
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: deploy
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            echo "⚠️ Deployment failed — rolling back..."
            cd /home/deploy/vibbo

            # Rollback: use the previous image tag
            docker compose -f docker-compose.prod.yml up -d --force-recreate app workers
```

### Required GitHub Secrets

| Secret                          | Description                       |
| ------------------------------- | --------------------------------- |
| `HETZNER_HOST`                  | Server IP address                 |
| `HETZNER_SSH_KEY`               | SSH private key for `deploy` user |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                 |

### Health Check Endpoint

Create a health check endpoint in your Next.js app:

```typescript
// web/app/api/health/route.ts
import { NextResponse } from "next/server";
import { isRedisReady } from "@/lib/queues/redis";

export async function GET() {
  try {
    const redisOk = await isRedisReady();

    return NextResponse.json(
      {
        status: redisOk ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        redis: redisOk ? "connected" : "disconnected",
        version: process.env.COMMIT_SHA || "unknown",
      },
      { status: redisOk ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
```

---

## 9. Monitoring, Logging & Alerting — PLG Stack

The **P**rometheus + **L**oki + **G**rafana stack gives you full observability at zero cost.

### `docker-compose.monitoring.yml`

```yaml
# =============================================================================
# Vibbo Monitoring Stack
# =============================================================================
# Usage: docker compose -f docker-compose.monitoring.yml up -d
# =============================================================================

services:
  # ---------------------------------------------------------------------------
  # Prometheus — Metrics Collection
  # ---------------------------------------------------------------------------
  prometheus:
    image: prom/prometheus:latest
    container_name: vibbo-prometheus
    restart: unless-stopped
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=30d"
      - "--storage.tsdb.retention.size=10GB"
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M

  # ---------------------------------------------------------------------------
  # Loki — Log Aggregation
  # ---------------------------------------------------------------------------
  loki:
    image: grafana/loki:3.4
    container_name: vibbo-loki
    restart: unless-stopped
    volumes:
      - ./loki/loki-config.yml:/etc/loki/loki-config.yml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/loki-config.yml
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M

  # ---------------------------------------------------------------------------
  # Promtail — Log Collection Agent
  # ---------------------------------------------------------------------------
  promtail:
    image: grafana/promtail:3.4
    container_name: vibbo-promtail
    restart: unless-stopped
    volumes:
      - ./promtail/promtail-config.yml:/etc/promtail/promtail-config.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/log:/var/log:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 256M

  # ---------------------------------------------------------------------------
  # Grafana — Visualisation & Dashboards
  # ---------------------------------------------------------------------------
  grafana:
    image: grafana/grafana:latest
    container_name: vibbo-grafana
    restart: unless-stopped
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_SERVER_ROOT_URL=https://metrics.vidbolt.app
    networks:
      - web
      - internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`metrics.vidbolt.app`)"
      - "traefik.http.routers.grafana.entrypoints=websecure"
      - "traefik.http.routers.grafana.tls.certresolver=letsencrypt"
      - "traefik.http.services.grafana.loadbalancer.server.port=3000"
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M

  # ---------------------------------------------------------------------------
  # Node Exporter — Host Metrics
  # ---------------------------------------------------------------------------
  node-exporter:
    image: prom/node-exporter:latest
    container_name: vibbo-node-exporter
    restart: unless-stopped
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - "--path.procfs=/host/proc"
      - "--path.sysfs=/host/sys"
      - "--path.rootfs=/rootfs"
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.15"
          memory: 128M

  # ---------------------------------------------------------------------------
  # cAdvisor — Container Metrics
  # ---------------------------------------------------------------------------
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: vibbo-cadvisor
    restart: unless-stopped
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: "0.15"
          memory: 128M

networks:
  web:
    external: true
  internal:
    external: true

volumes:
  prometheus_data:
  loki_data:
  grafana_data:
```

### `prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: "node-exporter"
    static_configs:
      - targets: ["node-exporter:9100"]

  - job_name: "cadvisor"
    static_configs:
      - targets: ["cadvisor:8080"]

  - job_name: "traefik"
    static_configs:
      - targets: ["traefik:8082"]

  - job_name: "redis"
    static_configs:
      - targets: ["redis-exporter:9121"]
```

### `loki/loki-config.yml`

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2026-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 30d
  max_query_length: 720h

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  delete_request_cancel_period: 10m
```

### `promtail/promtail-config.yml`

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Collect Docker container logs
  - job_name: docker
    docker_sd_configs:
      - host: "unix:///var/run/docker.sock"
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        target_label: "container"
        regex: "/(.*)"
      - source_labels:
          ["__meta_docker_container_label_com_docker_compose_service"]
        target_label: "service"
      - source_labels:
          ["__meta_docker_container_label_com_docker_compose_project"]
        target_label: "project"
    pipeline_stages:
      # Parse JSON logs from Next.js
      - json:
          expressions:
            level: level
            msg: msg
      - labels:
          level:
      # Extract BullMQ worker queue name from log lines
      - regex:
          expression: '^\[(?P<queue>[^\]]+)\]'
      - labels:
          queue:
```

### `grafana/provisioning/datasources/datasources.yml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    access: proxy

  - name: Loki
    type: loki
    url: http://loki:3100
    access: proxy
```

### What You Can Monitor

| Dashboard               | Metrics                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| **Server Health**       | CPU, RAM, Disk I/O, Network, Swap usage                              |
| **Container Resources** | Per-container CPU/RAM, restart count                                 |
| **Application**         | HTTP request rate, error rate (4xx/5xx), response times              |
| **BullMQ Queues**       | Active/completed/failed jobs per queue, queue depth, processing time |
| **Redis**               | Memory usage, connected clients, commands/sec                        |
| **Traefik**             | Request volume, backend health, SSL certificate expiry               |

### Pre-Built Dashboards to Import

Import these from Grafana.com (free):

| Dashboard          | Grafana ID | Purpose                  |
| ------------------ | ---------- | ------------------------ |
| Node Exporter Full | `1860`     | Server hardware metrics  |
| Docker + cAdvisor  | `14282`    | Container resource usage |
| Traefik            | `17346`    | Reverse proxy metrics    |
| Loki Log Explorer  | built-in   | Search and filter logs   |

---

## 10. BullMQ Dashboard

The Bull Board container provides a web UI for all 29 queues at `queues.vidbolt.app`. Protected with Basic Auth via Traefik middleware.

### What You Can Do

- View active, waiting, completed, failed, and delayed jobs per queue
- Retry failed jobs
- View job data and error stack traces
- Monitor queue throughput in real-time
- Pause/resume individual queues

### Security

Access is restricted via Traefik Basic Auth. Generate the password hash:

```bash
# Install htpasswd
apt install -y apache2-utils

# Generate hash (escape $ with $$ in docker labels)
htpasswd -nb admin YOUR_SECURE_PASSWORD
# Output: admin:$apr1$xyz...  → use admin:$$apr1$$xyz... in labels
```

---

## 11. Environment Variables — Production Checklist

### Variables to Set in `.env.production`

> [!CAUTION]
> Never commit `.env.production` to Git. Store it on the server only. Add it to `.gitignore`.

```bash
# =============================================================================
# Vibbo Production Environment Variables
# =============================================================================

# ---- Next.js ----
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
HOSTNAME=0.0.0.0
PORT=3000

# ---- Supabase (Cloud — keep using hosted) ----
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ---- Redis (local on Hetzner) ----
REDIS_URL=redis://redis:6379
# Upstash Redis can still be used for rate limiting if you want geo-distributed
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
```

### Environment Variables that Need Adjustment for Production

| Variable                | Dev Value                | Production Change                   |
| ----------------------- | ------------------------ | ----------------------------------- |
| `NODE_ENV`              | `development`            | → `production`                      |
| `NEXT_PUBLIC_APP_URL`   | `http://localhost:3000`  | → `https://app.vidbolt.app`         |
| `REDIS_URL`             | `redis://localhost:6379` | → `redis://redis:6379` (Docker DNS) |
| `STRIPE_SECRET_KEY`     | `sk_test_...`            | → `sk_live_...`                     |
| `STRIPE_WEBHOOK_SECRET` | test webhook secret      | → production webhook secret         |
| `R2_PUBLIC_URL`         | may be `localhost`       | → `https://assets.vidbolt.app`      |

---

## 12. External Service Production Adjustments

### Supabase

**Recommendation: Keep using Supabase Cloud.** Self-hosting Supabase on a CX-43 would consume 4-6 GB RAM just for PostgreSQL + GoTrue + PostgREST, leaving insufficient resources for your app.

| Action                         | Details                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| ✅ Enable RLS on all tables    | Already done based on security audit                               |
| ✅ Configure production SMTP   | Custom domain email for auth flows                                 |
| ✅ Enable MFA for your account | Dashboard → Account → Security                                     |
| ✅ Set up database backups     | Supabase provides daily backups on Pro plan                        |
| ✅ Review password policies    | Set minimum password length, limit login attempts                  |
| ⚠️ Update callback URLs        | Change auth callback from `localhost` to `https://app.vidbolt.app` |

### Cloudflare

| Action                                     | Details                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| ✅ Point DNS to Hetzner IP                 | A record: `app.vidbolt.app` → Hetzner server IP                                                   |
| ✅ Set SSL mode to **Full (Strict)**       | Cloudflare → SSL/TLS → Full (Strict)                                                              |
| ⚠️ Disable Cloudflare proxy (orange cloud) | Let Traefik handle SSL directly, OR keep Cloudflare proxy and use DNS challenge for Let's Encrypt |
| ✅ Configure R2 custom domain              | `assets.vidbolt.app` → R2 bucket                                                                  |
| ✅ Enable Cloudflare WAF rules             | Basic bot protection and rate limiting                                                            |
| ✅ Set up Page Rules                       | Cache static assets, redirect www → non-www                                                       |

> [!WARNING]
> **Cloudflare Proxy + Traefik SSL**: If you keep Cloudflare's proxy enabled (orange cloud), Traefik's HTTP challenge for Let's Encrypt may fail. Two options:
>
> 1. **Preferred**: Set Cloudflare proxy to DNS-only (grey cloud) and let Traefik handle SSL end-to-end
> 2. **Alternative**: Use Cloudflare's Origin Certificate in Traefik instead of Let's Encrypt, and keep CF proxy on for DDoS protection

### Upstash Redis

**Keep Upstash for rate limiting.** The local Redis instance handles BullMQ job queues, while Upstash handles rate limiting with geo-distributed edge nodes. This separation ensures rate limiting works even if the local Redis restarts.

### AWS (Remotion Lambda)

No changes needed — Lambda is invoked via API regardless of where your app runs. Just ensure:

- Your Hetzner server's IP is not blocked by AWS security groups
- The IAM user has the correct Remotion permissions
- S3 bucket CORS allows your production domain

### Stripe

| Action                           | Details                                       |
| -------------------------------- | --------------------------------------------- |
| ✅ Switch to live API keys       | Dashboard → Developers → API keys             |
| ✅ Update webhook endpoint       | `https://app.vidbolt.app/api/webhooks/stripe` |
| ✅ Verify webhook signing secret | New secret for production endpoint            |
| ✅ Test a real payment flow      | Use a real card in test mode first            |

---

## 13. Security Hardening

### Server Level

```bash
# Disable root SSH login
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Disable password authentication (SSH key only)
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Automatic security updates (already in setup script)
apt install -y unattended-upgrades

# Fail2ban for brute-force protection
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

### Docker Level

- All containers run with resource limits (CPU + Memory)
- Next.js container runs as non-root user (`nextjs`)
- Docker socket mounted read-only (`:ro`) in Traefik and Promtail
- Internal services not exposed externally (only through Traefik)
- Redis not exposed on host network — only accessible via Docker bridge

### Application Level

- All API routes behind Supabase auth (from your security audit)
- Rate limiting via Upstash Redis middleware
- CORS headers configured for production domain only
- Security headers set via Traefik middleware + Next.js config

---

## 14. Per-User Error Tracking & GPU API Observability

You need visibility into errors on a per-user basis — including failures from the GPU API, pipeline worker crashes, and external API errors. The best approach is a **two-layer system**:

1. **Structured error table in Supabase** — queryable per user, powers an admin page
2. **Grafana Loki** — raw log search for deep debugging (already in the monitoring stack)

### 14.1 Supabase `pipeline_errors` Table

Create a table to store structured errors from all pipeline stages:

```sql
-- Migration: create pipeline_errors table
CREATE TABLE pipeline_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  video_project_id UUID REFERENCES video_projects(id),

  -- Error classification
  source TEXT NOT NULL,           -- 'worker', 'gpu-api', 'lambda', 'external-api'
  queue_name TEXT,                -- BullMQ queue name (e.g., 'image-gen', 'orchestrator')
  job_id TEXT,                    -- BullMQ job ID for correlation

  -- Error details
  error_code TEXT,                -- HTTP status or custom error code
  error_message TEXT NOT NULL,    -- Human-readable message
  error_stack TEXT,               -- Stack trace (truncated)

  -- GPU API specific
  gpu_vm_ip TEXT,                 -- GPU VM IP that returned the error
  gpu_endpoint TEXT,              -- e.g., '/api/image/create', '/api/video/create'
  gpu_response JSONB,             -- Raw GPU API response body

  -- Context
  metadata JSONB DEFAULT '{}',    -- Additional context (model used, retry count, etc.)
  resolved BOOLEAN DEFAULT false, -- Mark errors as resolved from admin UI
  resolved_at TIMESTAMPTZ,
  notes TEXT                      -- Admin notes on resolution
);

-- Indexes for fast per-user queries
CREATE INDEX idx_pipeline_errors_user_id ON pipeline_errors(user_id, created_at DESC);
CREATE INDEX idx_pipeline_errors_source ON pipeline_errors(source, created_at DESC);
CREATE INDEX idx_pipeline_errors_unresolved ON pipeline_errors(resolved, created_at DESC)
  WHERE resolved = false;

-- RLS: only service role can write, admin can read all
ALTER TABLE pipeline_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pipeline_errors
  FOR ALL USING (auth.role() = 'service_role');
```

### 14.2 Error Logger Utility

Create a shared utility that workers call when errors occur:

```typescript
// lib/services/error-logger.ts
import { createServiceClient } from "@/lib/supabase/service";

interface PipelineError {
  userId: string;
  videoProjectId?: string;
  source: "worker" | "gpu-api" | "lambda" | "external-api";
  queueName?: string;
  jobId?: string;
  errorCode?: string;
  errorMessage: string;
  errorStack?: string;
  gpuVmIp?: string;
  gpuEndpoint?: string;
  gpuResponse?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logPipelineError(error: PipelineError): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("pipeline_errors").insert({
      user_id: error.userId,
      video_project_id: error.videoProjectId,
      source: error.source,
      queue_name: error.queueName,
      job_id: error.jobId,
      error_code: error.errorCode,
      error_message: error.errorMessage,
      error_stack: error.errorStack?.slice(0, 4000), // Truncate
      gpu_vm_ip: error.gpuVmIp,
      gpu_endpoint: error.gpuEndpoint,
      gpu_response: error.gpuResponse,
      metadata: error.metadata,
    });
  } catch (e) {
    // Never let error logging break the pipeline
    console.error("[ErrorLogger] Failed to log error:", e);
  }
}
```

### 14.3 Worker Integration

Add error logging to each worker's `catch` block. Example integration pattern:

```typescript
// In any worker processor (e.g., image-gen.ts)
catch (err) {
  await logPipelineError({
    userId: job.data.userId,
    videoProjectId: job.data.videoProjectId,
    source: 'worker',
    queueName: 'image-gen',
    jobId: job.id,
    errorMessage: err.message,
    errorStack: err.stack,
    metadata: { model: job.data.model, attempt: job.attemptsMade },
  });
  throw err; // Re-throw so BullMQ handles retries
}
```

For GPU API calls specifically, capture the response:

```typescript
// When a GPU API call fails
await logPipelineError({
  userId,
  videoProjectId,
  source: "gpu-api",
  queueName: "image-gen",
  jobId: job.id,
  errorCode: response.status.toString(),
  errorMessage: responseBody.error || "GPU API request failed",
  gpuVmIp: vmIp,
  gpuEndpoint: "/api/image/create",
  gpuResponse: responseBody,
  metadata: { model, promptLength: prompt.length },
});
```

### 14.4 Where to View Errors — Admin Dashboard Page

**Recommendation: Build an admin page within the Next.js app** at `/admin/errors`. This is the best option because:

- Users are already authenticated via Supabase
- You already have admin role checks in place
- No extra infrastructure needed
- Data is in Supabase — same query patterns as the rest of the app
- Can link directly to video projects and user profiles

#### Admin Errors Page Features

| Feature                  | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| **Per-user filter**      | Dropdown or search by email/user ID                                          |
| **Error source tabs**    | Filter by `worker`, `gpu-api`, `lambda`, `external-api`                      |
| **Time range picker**    | Last hour / 24h / 7d / 30d                                                   |
| **Error details drawer** | Click to expand: full stack trace, GPU response, metadata                    |
| **Resolve/dismiss**      | Mark errors as resolved with optional notes                                  |
| **Error rate chart**     | Simple line chart showing errors over time (using Recharts, already in deps) |
| **GPU API status**       | Live status of each user's GPU VM (call `checkGpuVmReady`)                   |
| **Export**               | Download error log as CSV for external analysis                              |

#### API Routes

```typescript
// GET /api/admin/errors?userId=X&source=gpu-api&limit=50&offset=0
// GET /api/admin/errors/stats   — error counts by source, by day
// PATCH /api/admin/errors/:id   — mark as resolved
// GET /api/admin/gpu-status/:userId — proxy to checkGpuVmReady()
```

### 14.5 Grafana Loki — Deep Log Search

For debugging beyond structured errors, use Grafana Loki (already deployed in Section 9). The Promtail config already extracts the `queue` label from worker log lines like `[image-gen] Job xyz failed`.

#### Useful LogQL Queries

```logql
# All errors from a specific queue
{service="vibbo-workers"} |= "failed" |= "image-gen"

# GPU API errors with HTTP status codes
{service="vibbo-workers"} |= "gpu" |= "error"

# Errors for a specific user (if userId is in log lines)
{service="vibbo-workers"} |= "USER_ID_HERE"

# All errors in the last hour
{service=~"vibbo-.*"} |= "error" | logfmt | level="error"

# GPU health check failures
{service="vibbo-workers"} |= "VM not ready"
```

### 14.6 When to Use Which Tool

| Scenario                             | Use                                              |
| ------------------------------------ | ------------------------------------------------ |
| "User X says their video failed"     | Admin page → filter by user                      |
| "GPU API has been flaky today"       | Admin page → filter by `gpu-api` source          |
| "What happened at 3am last night?"   | Grafana Loki → time-range search                 |
| "How many errors per day this week?" | Admin page → stats endpoint / Grafana dashboard  |
| "Debug a specific worker crash"      | Grafana Loki → full log context around the error |
| "Monitor error rates trending up"    | Grafana → alert on error rate metric             |

---

## 15. Backup & Disaster Recovery

### What Needs Backup

| Data                     | Location                     | Backup Method                             |
| ------------------------ | ---------------------------- | ----------------------------------------- |
| **Redis data**           | Docker volume `redis_data`   | Daily cron → compressed dump to R2        |
| **Traefik certificates** | `acme.json`                  | Copy with server config                   |
| **Environment file**     | `.env.production`            | Stored in password manager (never in Git) |
| **Grafana dashboards**   | Docker volume `grafana_data` | Provisioned via YAML (version-controlled) |

### Redis Backup Cron

```bash
# /home/deploy/scripts/backup-redis.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec vibbo-redis redis-cli BGSAVE
sleep 5
docker cp vibbo-redis:/data/dump.rdb /tmp/redis-backup-${TIMESTAMP}.rdb
gzip /tmp/redis-backup-${TIMESTAMP}.rdb
# Upload to R2 (using rclone or aws cli configured for R2)
rclone copy /tmp/redis-backup-${TIMESTAMP}.rdb.gz r2:vibbo-backups/redis/
rm /tmp/redis-backup-${TIMESTAMP}.rdb.gz
```

Add to crontab: `0 3 * * * /home/deploy/scripts/backup-redis.sh`

### Disaster Recovery Steps

1. Provision new CX-43 server
2. Run initial setup script (Section 3.2)
3. Clone deployment configs from Git repo
4. Place `.env.production` from password manager
5. Pull Docker images: `docker compose pull`
6. Restore Redis backup if needed
7. Start stack: `docker compose up -d`
8. Update DNS to point to new server IP
9. SSL certificates auto-issue via Traefik + Let's Encrypt

**Recovery Time Objective (RTO)**: ~15 minutes assuming DNS propagation is fast.

---

## 16. Rollback Strategy

### Automatic (via CI/CD)

The GitHub Actions workflow already includes a failure handler that rolls back on deploy failure.

### Manual Rollback

```bash
# SSH into server
ssh deploy@YOUR_HETZNER_IP

cd /home/deploy/vibbo

# List available image tags
docker images ghcr.io/YOUR_USER/vibbo-web --format "table {{.Tag}}\t{{.CreatedAt}}"

# Roll back to a specific commit SHA
docker compose -f docker-compose.prod.yml run --rm -d \
  -e IMAGE_TAG=abc1234 app

# Or simply pull and restart with a previous tag
docker pull ghcr.io/YOUR_USER/vibbo-web:PREVIOUS_SHA
docker compose -f docker-compose.prod.yml up -d app workers
```

### Image Retention

The CI/CD pipeline keeps the last 3 days of images. For rollback beyond that, rebuild from the Git commit:

```bash
git checkout COMMIT_SHA
docker build -f web/Dockerfile.prod -t vibbo-web:rollback ./web
```

---

## 17. Cost Summary

### Monthly Costs — Hetzner Setup

| Service                                  | Cost/month                                           |
| ---------------------------------------- | ---------------------------------------------------- |
| **Hetzner CX-43**                        | ~£10                                                 |
| **Domain** (if not already owned)        | ~£1                                                  |
| **SSL Certificates** (Let's Encrypt)     | Free                                                 |
| **Monitoring** (Grafana/Prometheus/Loki) | Free (self-hosted)                                   |
| **GitHub Actions CI/CD**                 | Free (2,000 min/mo for public repos, or use private) |
| **Docker Registry** (GHCR)               | Free (500 MB for private packages)                   |

### vs. Current Railway Costs

| Service     | Railway                 | Hetzner     |
| ----------- | ----------------------- | ----------- |
| Next.js App | ~$5-20/mo (usage-based) | Included    |
| Workers     | ~$5-20/mo               | Included    |
| Redis       | ~$5/mo (Railway plugin) | Included    |
| **Total**   | **~$15-45/mo**          | **~£10/mo** |

### External Services (Unchanged)

| Service               | Cost/month          |
| --------------------- | ------------------- |
| Supabase (Pro)        | $25                 |
| Upstash Redis         | Free tier or $10    |
| Cloudflare R2         | Pay-per-use (~$1-5) |
| AWS Lambda (Remotion) | Pay-per-use (~$1-5) |

---

## 18. Implementation Checklist

### Phase 1: Server Setup (Day 1)

- [ ] Provision Hetzner CX-43
- [ ] Run initial setup script (Docker, UFW, swap, deploy user)
- [ ] Create directory structure on server
- [ ] Install `docker-rollout` plugin
- [ ] Create Docker `web` network

### Phase 2: Production Docker Config (Day 1-2)

- [ ] Add `output: 'standalone'` to `next.config.ts`
- [ ] Create `Dockerfile.prod` (multi-stage standalone build)
- [ ] Create health check endpoint (`/api/health`)
- [ ] Create `docker-compose.prod.yml`
- [ ] Create Redis production config
- [ ] Test local Docker build

### Phase 3: Domain & SSL (Day 2)

- [ ] Configure Cloudflare DNS records (A records to Hetzner IP)
- [ ] Deploy Traefik config files
- [ ] Create and permission `acme.json`
- [ ] Verify SSL certificate auto-issuance
- [ ] Decide Cloudflare proxy strategy (DNS-only vs proxied + Origin Cert)

### Phase 4: CI/CD Pipeline (Day 2-3)

- [ ] Set up GitHub Secrets (SSH key, server IP, env vars)
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Push to `main` — verify first automated deployment
- [ ] Verify zero-downtime rollout works
- [ ] Test rollback procedure

### Phase 5: Environment & External Services (Day 3)

- [ ] Create `.env.production` on server
- [ ] Switch Stripe to live keys
- [ ] Update Supabase auth callback URLs
- [ ] Update Stripe webhook endpoint
- [ ] Verify all API integrations from server
- [ ] Update `NEXT_PUBLIC_APP_URL`

### Phase 6: Monitoring Stack (Day 3-4)

- [ ] Deploy `docker-compose.monitoring.yml`
- [ ] Configure Prometheus scrape targets
- [ ] Configure Loki + Promtail for container logs
- [ ] Deploy Grafana with provisioned data sources
- [ ] Import recommended dashboards (Node Exporter, Docker, Traefik)
- [ ] Configure Grafana alerts (disk >80%, RAM >90%, error rate spikes)
- [ ] Deploy Bull Board with Basic Auth

### Phase 7: Per-User Error Tracking (Day 4)

- [ ] Run `pipeline_errors` table migration in Supabase
- [ ] Create `lib/services/error-logger.ts` utility
- [ ] Integrate `logPipelineError()` into GPU API workers (image-gen, video-gen, etc.)
- [ ] Integrate `logPipelineError()` into orchestrator and other critical workers
- [ ] Create `/api/admin/errors` API routes (list, stats, resolve)
- [ ] Create `/api/admin/gpu-status/:userId` proxy endpoint
- [ ] Build `/admin/errors` page with per-user filtering, source tabs, and error charts
- [ ] Test error logging end-to-end with a deliberate GPU API failure

### Phase 8: Security & Backup (Day 4-5)

- [ ] Disable root SSH access
- [ ] Install and configure Fail2ban
- [ ] Configure Cloudflare SSL mode (Full Strict)
- [ ] Set up Redis backup cron job
- [ ] Store `.env.production` in password manager
- [ ] Store SSH keys in password manager
- [ ] Run a disaster recovery drill

### Phase 9: Go Live (Day 5-6)

- [ ] Smoke test all pipeline stages end-to-end
- [ ] Monitor Grafana dashboards for 24 hours
- [ ] Review Loki logs for any errors
- [ ] Switch production traffic from Railway to Hetzner
- [ ] Scale down / decommission Railway services
- [ ] Update `technologies.md` to reflect new hosting

---

> [!NOTE]
> **Migration Strategy**: Run both Railway and Hetzner in parallel during the transition. Point a staging subdomain (e.g., `staging.vidbolt.app`) to Hetzner first, test everything thoroughly, then switch the production domain's DNS only when confident.
