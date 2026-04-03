---
trigger: model_decision
description: For CI/CD workflow and devops.
---

### DevOps & Deployment Scope: Vid-Bolt

#### CI/CD Workflows

- **CI Pipeline (`.github/workflows/ci.yml`)**: Triggers on PRs to `main` affecting `web/` or `docker-compose.prod.yml`. Uses GHA cache for build efficiency. Do not push images in CI.
- **CD Pipeline (`.github/workflows/deploy.yml`)**: Triggers on `main` pushes. Requires `packages: write` permissions to push to `ghcr.io`. Always uses `docker/metadata-action` for image tagging (SHA and raw tags).

#### Docker & Containerization

- **Build Context**: The web service builds from `./web/Dockerfile.prod`. Ensure all build-time environment variables (e.g., `NEXT_PUBLIC_SUPABASE_URL`) are passed via `build-args` in the workflow.
- **Registry**: All images are targeted at `ghcr.io` under the `obress/vibbo-web` namespace.

#### Operational Constraints

- **Concurrency**: CI jobs are grouped by branch to allow parallel testing, while `deploy-production` is strictly serialized to prevent race conditions during deployment.
- **Environment Variables**: Sensitive secrets must be managed via GitHub Secrets and injected into the build process; do not hardcode credentials in `Dockerfile.prod` or `docker-compose.prod.yml`.

#### Unknowns / Verify

- Exact deployment target infrastructure (e.g., specific cloud provider or orchestrator) is not explicitly defined in the provided evidence beyond the use of `docker-compose.prod.yml`.
- GPU-specific configuration details for background workers are not present in the current `Dockerfile` or workflow excerpts.
