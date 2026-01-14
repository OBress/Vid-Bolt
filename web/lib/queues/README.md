# BullMQ Queue System

This folder contains the BullMQ queue infrastructure for background job processing.

## Structure

```
lib/queues/
├── index.ts            # Re-exports for external consumption
├── redis.ts            # Redis connection singleton
├── queues.ts           # Queue definitions
├── rate-limiter.ts     # Rate limiting utilities for external APIs
├── worker-bootstrap.ts # Worker startup script
└── workers/
    ├── index.ts        # Worker processor exports
    └── writing.ts      # Writing workflow processor
```

## Local Development

### 1. Start Redis

```bash
# From project root
docker-compose up -d
```

This starts a Redis container on `localhost:6379`.

### 2. Start Workers

In a separate terminal:

```bash
cd web
npm run workers
```

This starts the BullMQ workers with hot-reload for development.

### 3. Start Next.js

```bash
npm run dev
```

## Production (Railway)

### 1. Add Redis Service

In Railway dashboard:

- Go to your project → "New" → "Database" → "Redis"
- Railway will provision Redis and set `REDIS_URL` automatically

### 2. Configure Worker Service

Create a separate Railway service for workers:

- Start command: `npm run workers:start`
- Uses same environment variables as main app

## Environment Variables

| Variable         | Description                            | Default     |
| ---------------- | -------------------------------------- | ----------- |
| `REDIS_URL`      | Full Redis connection string (Railway) | -           |
| `REDIS_HOST`     | Redis host (local dev)                 | `localhost` |
| `REDIS_PORT`     | Redis port (local dev)                 | `6379`      |
| `REDIS_PASSWORD` | Redis password (optional)              | -           |

## Queue Configuration

Default job options:

- **Attempts**: 2 (retry once on failure)
- **Backoff**: Exponential, starting at 2 seconds
- **Completed job retention**: 100 jobs or 24 hours
- **Failed job retention**: 500 jobs or 7 days

## Rate Limiting

The `rate-limiter.ts` module provides utilities for handling API rate limits:

```typescript
import { withRateLimitHandling } from "@/lib/queues";

// Automatically handles 429 errors with retry
const result = await withRateLimitHandling(async () => {
  return await generateText(userId, systemPrompt, userPrompt);
});
```

When a 429 error is detected:

1. The rate limiter signals all workers to pause
2. Workers wait for the cooldown period
3. Requests resume automatically

## Adding New Workers

1. Create processor in `workers/`:

```typescript
// workers/my-queue.ts
import { Job, Processor } from "bullmq";

interface MyJobData {
  // ... job data interface
}

export const myProcessor: Processor<MyJobData> = async (job) => {
  // ... processing logic
  return { success: true };
};
```

2. Add queue to `queues.ts`:

```typescript
export const myQueue = createQueue("my-queue");
```

3. Register in `worker-bootstrap.ts`:

```typescript
workerConfigs.push({
  queue: "my-queue",
  processor: myProcessor,
  concurrency: 5,
  description: "My queue description",
});
```

4. Export from `index.ts`:

```typescript
export { myQueue } from "./queues";
```
