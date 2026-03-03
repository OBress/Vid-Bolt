# Concurrency & Scalability Architecture

How VidBolt handles concurrent video production across multiple users and within a single user.

---

## Overview

VidBolt processes video production pipelines asynchronously through **BullMQ job queues** backed by **Redis**. All background work — script generation, TTS, GPU media generation, video rendering — flows through this queue system. Jobs are never rejected; they always queue and wait for a processing slot.

### Key Principles

1. **Multi-user isolation** — Different users' jobs share the same queues but carry independent `userId`/`videoId` context. No shared mutable state exists between users.
2. **Intra-user GPU serialization** — Each user has a single GPU VM. A Redis distributed lock ensures only one GPU batch operation runs at a time per user, preventing VRAM mode thrashing.
3. **Atomic state updates** — All metadata writes use Supabase RPCs (`merge_video_metadata`, `append_task_step`) that perform atomic JSONB merges, preventing read-modify-write races.
4. **Queue-based capacity management** — Lambda rendering and GPU work use BullMQ concurrency limits to control how many jobs process simultaneously. Excess jobs queue and proceed when slots open.

---

## GPU VM Serialization

### Problem

Each user's GPU VM runs a single AI model at a time (constrained by VRAM). The system supports image generation, video generation, image editing, and music generation — each requiring a different VRAM mode. If two pipelines for the same user hit Phase IV simultaneously, they would fight over the VRAM mode (image ↔ video thrashing), causing failures.

### Solution: Per-User Redis Mutex

**File:** `lib/queues/gpu-lock.ts`

A distributed lock keyed by `gpu-lock:{userId}` ensures only one GPU batch operation runs at a time per user:

```
User A, Video 1: acquireGpuLock("user-a") → ✅ runs GPU generation
User A, Video 2: acquireGpuLock("user-a") → ⏳ waits (polls every 2s)
User B, Video 1: acquireGpuLock("user-b") → ✅ runs independently
```

**Safety features:**

- **Auto-expiry (TTL):** Lock expires after a configurable timeout (default: 30 min) to prevent deadlocks if a worker crashes
- **Token-based release:** Uses a UUID token with Lua atomic check-and-delete — only the holder can release
- **Dynamic TTL:** Lock TTL is calculated based on batch size and generation type to minimize overly-long lock holds

**Used by:** `image-gen.ts` and `video-gen.ts` workers wrap their `processGpuBatchGeneration()` calls in `withGpuLock()`.

---

## Lambda Rendering Concurrency

### Problem

Each Remotion Lambda render can use up to 200 concurrent Lambda invocations. With a default BullMQ concurrency of 4, that's 800 simultaneous Lambda invocations. AWS accounts have a default concurrent execution limit of 1,000.

### Solution: Dynamic Concurrency Cap

**Files:** `lib/services/render/lambda-config.ts`, `lib/queues/worker-bootstrap.ts`

The render worker's BullMQ concurrency is automatically capped:

```
safeConcurrentRenders = floor(LAMBDA_ACCOUNT_CONCURRENCY / LAMBDAS_PER_RENDER)
workerConcurrency = min(RENDER_CONCURRENCY_LIMIT, safeConcurrentRenders)
```

**Default:** `floor(1000 / 200) = 5` → capped to `min(4, 5) = 4`

### Environment Variables

| Variable                     | Default | Description                                           |
| ---------------------------- | ------- | ----------------------------------------------------- |
| `LAMBDA_ACCOUNT_CONCURRENCY` | 1000    | AWS Lambda concurrent execution limit for the account |
| `LAMBDAS_PER_RENDER`         | 200     | Lambda invocations per render (max 200)               |
| `RENDER_CONCURRENCY_LIMIT`   | 4       | BullMQ worker concurrency for render jobs             |
| `MAX_RENDERS_PER_USER`       | 3       | Per-user render rate limit (API layer)                |

---

## Metadata Safety

### Problem

Multiple workers can write to `video_projects.metadata` concurrently (e.g., during Phase IV when GPU generation and motion graphics run in parallel). A naive read → spread-merge → write pattern causes the second writer to silently overwrite the first writer's changes.

### Solution: Atomic JSONB Merge RPC

All metadata updates use the `merge_video_metadata` Supabase RPC:

```sql
UPDATE video_projects
SET metadata = COALESCE(metadata, '{}'::jsonb) || p_updates
WHERE id = p_video_id;
```

The `||` operator performs a **shallow JSONB merge** within a single atomic SQL statement — no read-modify-write gap exists.

**Applied to:**

- `image-gen.ts` — `generated_images`, `image_gen_stats`
- `video-gen.ts` — `generated_videos`, `video_gen_stats`
- `orchestrator.ts` — `generated_motion_graphics`, `pipeline_diagnostics` (4 locations)

---

## Billing Safety

GPU hours are managed through an atomic `deduct_gpu_hours` RPC that uses `SELECT ... FOR UPDATE` row-level locking. This prevents double-spend even if two renders for the same user fire simultaneously — the second blocks until the first transaction commits.

---

## BullMQ Worker Concurrency Reference

| Queue                | Concurrency | Multi-User Safe | Notes                              |
| -------------------- | ----------- | --------------- | ---------------------------------- |
| `orchestrator`       | 2           | ✅              | Coordinates full pipeline          |
| `image-gen`          | 3           | ✅              | Wrapped in per-user GPU lock       |
| `video-gen`          | 2           | ✅              | Wrapped in per-user GPU lock       |
| `video-render`       | 4 (capped)  | ✅              | Capped by Lambda concurrency limit |
| `writing-workflow`   | 3           | ✅              | LLM calls, per-video isolation     |
| `audio-workflow`     | 5           | ✅              | TTS, per-video isolation           |
| `verifier`           | 5           | ✅              | VLM quality checks                 |
| `stock-media-scrape` | 2           | ✅              | External API calls                 |

---

## Future Scaling Considerations

### Horizontal Worker Scaling

If worker processes are ever scaled horizontally (multiple instances):

1. **GPU lock** — Already Redis-backed, will work across instances automatically
2. **Rate limiter** — Currently in-process (`Map`). Must migrate to Redis-backed sliding window if scaling horizontally (see `lib/queues/rate-limiter.ts`)
3. **BullMQ** — Natively supports multiple worker instances via Redis

### Multi-GPU Support

If users upgrade to multi-GPU VMs:

- The GPU lock could be extended to support `N` concurrent locks per user (semaphore instead of mutex)
- The `ensureMode()` function in `gpu-batch-generation.ts` would need per-GPU mode tracking

### Increased Lambda Quotas

If AWS Lambda concurrency quota is increased:

- Set `LAMBDA_ACCOUNT_CONCURRENCY` to the new limit
- The render worker concurrency will automatically adjust on next startup
