---
trigger: glob
globs: web/**
---

## Stack

**Frontend:** Next.js 14+ App Router, TypeScript strict, Tailwind, Zustand, TanStack Query, Socket.io-client, Radix UI, DesignCombo Editor
**Backend:** Next.js Route Handlers, Supabase (DB+Auth), Upstash Redis, Remotion Lambda
**Storage:** Cloudflare R2 (primary), AWS S3 (Remotion only)
**AI:** ComfyUI on GCP/VAST.ai/RunPod, external LLM + TTS APIs
**Deploy:** Vercel, Cloudflare CDN

## Code Rules

**TypeScript:** Strict mode, no `any`, explicit return types, `import type` for types only

**React/Next.js:** Server Components default, `'use client'` only when needed, named exports, App Router only

**State:** TanStack Query (server) → Zustand (global) → useState (local)

**API Routes:** `route.ts` handlers, Zod validation, `{ error, code? }` format, middleware auth

**Database:** Supabase client only, RLS on all tables, generated types

**Security:** No client-side API keys, validate inputs, encrypt secrets, verify ownership

## Naming

- Components: `PascalCase.tsx`
- Hooks/utils: `camelCase.ts`
- Routes: `page.tsx`, `route.ts`, `layout.tsx`
- Imports: `@/` absolute, relative for same dir

## Structure

```
web/app/        # Routes + API
web/components/ # By feature
web/lib/        # Services
web/hooks/      # Custom hooks
web/stores/     # Zustand
web/types/      # TS types
web/inngest/    # Jobs
web/remotion/   # Video
web/supabase/   # Schema
```

## Patterns

- Server Components for initial fetch, TanStack Query for client
- Signed URLs for R2 uploads
