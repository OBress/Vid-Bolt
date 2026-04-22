# Universal LLM Provider System

> **Status:** Production — Introduced April 2026  
> **Default Provider:** OpenRouter  
> **Available Providers:** OpenRouter, Inworld AI Router

---

## Overview

Vid-Bolt uses a **provider-agnostic LLM client** that routes every AI call through a user-selectable provider. Users can toggle between **OpenRouter** and **Inworld AI Router** in the Settings dashboard. The active provider and API key are stored per-user in Supabase and resolved at call-time.

The system follows a **facade pattern** — all existing call sites (`callOpenRouter`, `streamOpenRouter`, etc.) continue to work without any import changes. They are re-exported from `lib/ai/openrouter.ts` as backward-compatible aliases.

---

## Architecture

```
User Request (API Route / BullMQ Worker)
        │
        ▼
getLlmProviderConfig(userId)          ← lib/services/api-keys.ts
  → { apiKey, provider }              reads user_api_keys table
        │
        ▼
callLLMWithKey(apiKey, messages, config, provider)
        │                             ← lib/ai/client.ts (universal client)
        ▼
getProvider(provider)                 ← lib/ai/registry.ts
  → LLMProviderAdapter                (openrouter or inworld)
        │
        ├── buildHeaders(apiKey, xTitle)
        ├── buildRequestBody(messages, config)
        └── POST → provider.baseUrl/chat/completions
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/ai/providers/types.ts` | Core interfaces: `LlmProvider`, `LLMMessage`, `LLMConfig`, `LLMProviderAdapter` |
| `lib/ai/providers/openrouter.ts` | OpenRouter adapter |
| `lib/ai/providers/inworld-router.ts` | Inworld AI Router adapter |
| `lib/ai/registry.ts` | Provider registry — `registerProvider`, `getProvider` |
| `lib/ai/client.ts` | Universal LLM client — retry, rate-limit, cost tracking, streaming |
| `lib/ai/openrouter.ts` | **Backward-compat facade** — re-exports everything from `client.ts` |
| `lib/services/api-keys.ts` | `getLlmProviderConfig(userId)` — resolves provider + key |
| `hooks/use-api-keys.ts` | Client hook — exposes `inworld_router_key` + `llm_provider` availability |

---

## Database Schema

The `user_api_keys` table has two new columns added to support this system:

```sql
ALTER TABLE user_api_keys
  ADD COLUMN inworld_router_key TEXT,       -- Inworld LLM Router key (separate from TTS)
  ADD COLUMN llm_provider TEXT DEFAULT 'openrouter'; -- 'openrouter' | 'inworld'
```

> **Note:** `inworld_tts_key` remains a **separate** column. Users can use the same physical key for both TTS and the LLM Router, or different keys for better per-service cost tracking.

---

## Usage Patterns

### Pattern A — userId-based (BullMQ workers, background jobs)

The provider and API key are resolved automatically from Supabase.

```typescript
import { callLLM, generateJSON, streamLLM } from '@/lib/ai/client';

// Non-streaming
const result = await callLLM(userId, messages, { model: 'google/gemini-3-flash-preview' });

// Streaming
for await (const chunk of streamLLM(userId, messages, config)) {
  // process chunk
}

// JSON generation
const data = await generateJSON<MyType>(userId, systemPrompt, userPrompt, config);
```

### Pattern B — key-based (Next.js API routes)

Used in API routes where the caller pre-resolves the provider config before streaming begins.

```typescript
import { getLlmProviderConfig } from '@/lib/services/api-keys';
import { callLLMWithKey, streamLLMWithKey } from '@/lib/ai/client';
// OR via the backward-compat facade:
import { callOpenRouterWithKey, streamOpenRouterWithKey } from '@/lib/ai/openrouter';

// In your API route handler:
const { apiKey, provider } = await getLlmProviderConfig(userId);

// Non-streaming
const result = await callOpenRouterWithKey(apiKey, messages, config, provider);

// Streaming
for await (const chunk of streamOpenRouterWithKey(apiKey, messages, config, provider)) {
  // write to SSE
}
```

### Web Search — always OpenRouter

Inworld Router does not support a web-search plugin. The `generateWithWebSearch` and `generateJSONWithWebSearch` functions are **always pinned to OpenRouter**, regardless of the user's active provider setting.

```typescript
import { generateWithWebSearch } from '@/lib/ai/client';

const result = await generateWithWebSearch(userId, systemPrompt, userPrompt, { maxResults: 5 });
```

---

## Provider Configuration

### OpenRouter
- **Base URL:** `https://openrouter.ai/api/v1`
- **Default model:** `google/gemini-3-flash-preview`
- **Web search:** ✅ Supported (native plugin)
- **Auth header:** `Authorization: Bearer <key>`

### Inworld AI Router
- **Base URL:** `https://api.inworld.ai/llm/v1`
- **Default model:** `google/gemini-3-flash-preview`
- **Web search:** ❌ Not supported (auto-falls back to OpenRouter)
- **Auth header:** `Authorization: Basic <key>`

---

## Adding a New Provider

1. Create `lib/ai/providers/<name>.ts` implementing `LLMProviderAdapter`
2. Call `registerProvider(yourAdapter)` in `lib/ai/registry.ts`
3. Add the provider ID to the `LlmProvider` union in `lib/ai/providers/types.ts`
4. Add the new API key column to `user_api_keys` in Supabase
5. Update `getLlmProviderConfig` in `lib/services/api-keys.ts`
6. Add the key input and toggle button to `ApiKeysTab.tsx`

---

## Cross-Cutting Concerns (handled by `client.ts`)

| Concern | Detail |
|---------|--------|
| **Per-user concurrency** | Redis-backed semaphore (`acquireSlot`/`releaseSlot`) — only for userId-based calls |
| **Rate limiting** | Per-provider backoff via `waitIfRateLimited`/`signalRateLimited` |
| **Retry with backoff** | Exponential backoff, configurable via `maxRetries` (default: 3) |
| **Cost tracking** | Hooks into `CostTracker.addLlmCall` if active (BullMQ workers only) |
| **Streaming** | Async generator, SSE `data: {...}` parsing, `[DONE]` termination |
| **Truncation warnings** | Logs `finish_reason=length` with token counts |
| **Multimodal** | Text, `image_url`, `video_url` content parts |

---

## User-Facing Settings

Users manage their LLM provider in **Settings → API Keys**:

1. **LLM Provider toggle** — switches between OpenRouter and Inworld Router (persisted to `user_api_keys.llm_provider`)
2. **OpenRouter API Key** — required for OpenRouter provider
3. **Inworld Router Key (LLM)** — required for Inworld Router; separate from the TTS key
4. **Inworld TTS API Key** — for text-to-speech only (unchanged)

A yellow warning is shown if the user switches to Inworld but has not yet entered an Inworld Router key.

---

## Migration Notes

All existing call sites were migrated via the facade pattern — **no import changes were required**. The `provider` argument was added as an **optional parameter** with `'openrouter'` as the default value to every internal function that previously called OpenRouter directly, ensuring full backward compatibility.

Migrated files include:
- `app/api/video-editor/enhance-prompt/route.ts`
- `app/api/process/script-chat/route.ts`
- `app/api/motion-graphics/visual-qc/route.ts`
- `app/api/motion-graphics/generate/route.ts`
- `lib/services/motion-graphics/motion-graphics-service.ts`
- `lib/services/motion-graphics/template-lane.ts`
- `lib/services/pacing-editor.ts`
- `lib/services/clip-trimmer.ts`
- `lib/queues/workers/verifier.ts`
