### Project Overview
Vid-Bolt orchestrates multi-stage video pipelines (scripting, media generation, editing, rendering). The system relies on a closed-loop architecture where an Orchestrator worker manages state, while specialized workers handle media synthesis.

### Tech Stack
- **Frontend**: Next.js (App Router)
- **Queueing**: BullMQ + Redis
- **Infrastructure**: Docker Compose, Traefik v3, Hetzner-based deployment
- **Database**: Supabase (PostgreSQL)

### Directory Structure
- `/web`: Next.js application source.
- `/docs`: Durable feature documentation and architecture design.
- `/traefik`: Reverse proxy configuration.
- `/mmm`: Media processing utilities.

### Commands
- **Development**: `docker compose up --build` (starts app on port 3001, Redis on 6379).
- **Pipeline Debugging**: Access via the Pipeline Debugger UI (Perf Tab).

### Coding Standards
- **State Management**: Use Supabase RPCs (`merge_video_metadata`, `append_task_step`) for atomic JSONB updates.
- **Concurrency**: Adhere to intra-user GPU serialization; ensure only one GPU batch operation runs per user via Redis locks.
- **Components**: Follow the established `web/components/features` and `web/features/video-editor-v2` patterns.

### Error Handling
- Jobs are queue-based and persistent; use BullMQ retry logic for transient failures.
- Maintain metadata integrity by using atomic RPC calls to prevent read-modify-write races.

### Security Practices
- **Authentication**: Use Google OAuth via Supabase.
- **Production**: Follow the `docs/cicd-deployment-architecture.md` for hardening and Traefik SSL configuration.
- **Environment**: Keep sensitive credentials in `.env.local` (not committed).

### Documentation Practices
- Use the `/docs` directory for all durable feature documentation. 
- Document complex, fast-changing features (e.g., pipeline logic, AI bypass methods, analytics design) here to ensure onboarding context remains current.

### Git Workflow
- Unknown: Follow standard PR-based workflows; ensure CI/CD pipeline passes via GitHub Actions.

### Definition of Done
- Feature implementation must include relevant type definitions, atomic database updates, and corresponding documentation in `/docs` if the feature is non-trivial.